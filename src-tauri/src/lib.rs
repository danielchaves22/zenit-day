use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

struct Database(Mutex<Connection>);
#[derive(Serialize)]
struct Snapshot {
    version: i64,
    data: Option<String>,
}

fn initialize(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS workspaces(namespace TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(namespace TEXT PRIMARY KEY, encrypted BLOB NOT NULL);")
}
fn read_state(connection: &Connection, namespace: &str) -> Result<Snapshot, String> {
    connection
        .query_row(
            "SELECT version, data FROM workspaces WHERE namespace=?1",
            [namespace],
            |r| {
                Ok(Snapshot {
                    version: r.get(0)?,
                    data: Some(r.get(1)?),
                })
            },
        )
        .optional()
        .map(|v| {
            v.unwrap_or(Snapshot {
                version: 0,
                data: None,
            })
        })
        .map_err(|_| "Não foi possível ler os dados locais.".into())
}
fn write_state(
    connection: &mut Connection,
    namespace: &str,
    expected: i64,
    data: &str,
) -> Result<i64, String> {
    if namespace.len() > 512 || data.len() > 32_000_000 || expected < 0 {
        return Err("Armazenamento inválido ou maior que 32 MB.".into());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(data).map_err(|_| "Dados locais inválidos.")?;
    if parsed.get("schema").and_then(|v| v.as_u64()) != Some(1) {
        return Err("Versão de armazenamento incompatível.".into());
    }
    let tx = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|_| "Falha ao iniciar a gravação local.")?;
    let version = read_state(&tx, namespace)?.version;
    if version != expected {
        return Err(
            "Os dados mudaram em outra janela. Reabra esta janela antes de continuar.".into(),
        );
    }
    tx.execute("INSERT INTO workspaces(namespace,version,data) VALUES (?1,?2,?3) ON CONFLICT(namespace) DO UPDATE SET version=excluded.version,data=excluded.data",params![namespace,version+1,data]).map_err(|_|"Não foi possível salvar. Verifique o espaço disponível.")?;
    tx.commit()
        .map_err(|_| "Não foi possível confirmar a gravação local.")?;
    Ok(version + 1)
}
#[tauri::command]
fn workspace_read(db: tauri::State<Database>, namespace: String) -> Result<Snapshot, String> {
    let connection = db.0.lock().map_err(|_| "Armazenamento ocupado.")?;
    read_state(&connection, &namespace)
}
#[tauri::command]
fn workspace_write(
    db: tauri::State<Database>,
    namespace: String,
    expected: i64,
    data: String,
) -> Result<i64, String> {
    let mut connection = db.0.lock().map_err(|_| "Armazenamento ocupado.")?;
    write_state(&mut connection, &namespace, expected, &data)
}

#[cfg(windows)]
fn protect(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Não foi possível acessar a sessão protegida do Windows.".into());
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as *mut _);
        Ok(result)
    }
}
#[cfg(target_os = "android")]
struct AndroidVault<R: tauri::Runtime>(tauri::plugin::PluginHandle<R>);

#[tauri::command]
async fn session_read<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    namespace: String,
) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        let db = app.state::<Database>();
        let connection = db.0.lock().map_err(|_| "Armazenamento ocupado.")?;
        let bytes: Option<Vec<u8>> = connection
            .query_row(
                "SELECT encrypted FROM sessions WHERE namespace=?1",
                [namespace],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| "Falha ao ler a sessão.")?;
        bytes
            .map(|b| {
                protect(&b, false)
                    .and_then(|v| String::from_utf8(v).map_err(|_| "Sessão inválida.".into()))
            })
            .transpose()
    }
    #[cfg(target_os = "android")]
    {
        #[derive(serde::Deserialize)]
        struct Response {
            value: Option<String>,
        }
        let response: Response = app
            .state::<AndroidVault<R>>()
            .0
            .run_mobile_plugin("read", serde_json::json!({"key":namespace}))
            .map_err(|_| "Não foi possível ler a sessão protegida do Android.")?;
        Ok(response.value)
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = (app, namespace);
        Err("Armazenamento protegido ainda não disponível nesta plataforma.".into())
    }
}
#[tauri::command]
async fn session_write<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    namespace: String,
    value: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let db = app.state::<Database>();
        let connection = db.0.lock().map_err(|_| "Armazenamento ocupado.")?;
        if let Some(value) = value {
            let encrypted = protect(value.as_bytes(), true)?;
            connection.execute("INSERT INTO sessions(namespace,encrypted) VALUES(?1,?2) ON CONFLICT(namespace) DO UPDATE SET encrypted=excluded.encrypted",params![namespace,encrypted]).map_err(|_|"Falha ao proteger a sessão.")?;
        } else {
            connection
                .execute("DELETE FROM sessions WHERE namespace=?1", [namespace])
                .map_err(|_| "Falha ao remover a sessão.")?;
        }
        Ok(())
    }
    #[cfg(target_os = "android")]
    {
        app.state::<AndroidVault<R>>()
            .0
            .run_mobile_plugin::<serde_json::Value>(
                "write",
                serde_json::json!({"key":namespace,"value":value}),
            )
            .map_err(|_| "Não foi possível proteger a sessão no Android.")?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = (app, namespace, value);
        Err("Plataforma não suportada.".into())
    }
}
#[tauri::command]
async fn export_backup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    name: String,
    contents: String,
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use tauri_plugin_dialog::DialogExt;
        if let Some(path) = app
            .dialog()
            .file()
            .add_filter("Cópia do Zenit Day", &["json"])
            .set_file_name(name)
            .blocking_save_file()
        {
            let path = path.into_path().map_err(|_| "Caminho inválido.")?;
            std::fs::write(path, contents).map_err(|_| "Não foi possível salvar a cópia.")?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    #[cfg(target_os = "android")]
    {
        let r: serde_json::Value = app
            .state::<AndroidVault<R>>()
            .0
            .run_mobile_plugin(
                "exportBackup",
                serde_json::json!({"name":name,"contents":contents}),
            )
            .map_err(|_| "Não foi possível exportar a cópia.")?;
        Ok(r["saved"].as_bool().unwrap_or(false))
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = (app, name, contents);
        Err("Plataforma não suportada.".into())
    }
}
#[tauri::command]
async fn import_backup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use tauri_plugin_dialog::DialogExt;
        if let Some(path) = app
            .dialog()
            .file()
            .add_filter("Cópia do Zenit Day", &["json"])
            .blocking_pick_file()
        {
            let path = path.into_path().map_err(|_| "Caminho inválido.")?;
            if std::fs::metadata(&path)
                .map_err(|_| "Arquivo indisponível.")?
                .len()
                > 20_000_000
            {
                return Err("A cópia excede 20 MB.".into());
            }
            Ok(Some(
                std::fs::read_to_string(path).map_err(|_| "Não foi possível ler a cópia.")?,
            ))
        } else {
            Ok(None)
        }
    }
    #[cfg(target_os = "android")]
    {
        let r: serde_json::Value = app
            .state::<AndroidVault<R>>()
            .0
            .run_mobile_plugin("importBackup", serde_json::json!({}))
            .map_err(|_| "Não foi possível importar a cópia.")?;
        Ok(r["contents"].as_str().map(str::to_string))
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = app;
        Err("Plataforma não suportada.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(
        tauri::plugin::Builder::<_, ()>::new("vault")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("br.com.equinox.zenitday", "VaultPlugin")?;
                app.manage(AndroidVault(handle));
                Ok(())
            })
            .build(),
    );
    builder
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = Connection::open(directory.join("zenit-day.sqlite"))?;
            initialize(&connection)?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_read,
            workspace_write,
            session_read,
            session_write,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Zenit Day");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_is_atomic_scoped_and_rejects_stale_writers() {
        let mut c = Connection::open_in_memory().unwrap();
        initialize(&c).unwrap();
        assert_eq!(
            write_state(
                &mut c,
                "user-a",
                0,
                r#"{"schema":1,"queue":[1],"subjects":{"a":{}}}"#
            )
            .unwrap(),
            1
        );
        assert!(write_state(&mut c, "user-a", 0, r#"{"schema":1,"queue":[]}"#).is_err());
        let a = read_state(&c, "user-a").unwrap();
        assert!(a.data.unwrap().contains("\"queue\":[1]"));
        assert!(read_state(&c, "user-b").unwrap().data.is_none());
    }
    #[cfg(windows)]
    #[test]
    fn protected_session_round_trip() {
        let plain = b"synthetic-test-token";
        let cipher = protect(plain, true).unwrap();
        assert_ne!(cipher, plain);
        assert_eq!(protect(&cipher, false).unwrap(), plain);
    }
}
