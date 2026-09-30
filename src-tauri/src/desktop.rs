use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use tokio::sync::oneshot;

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    pub autostart: bool,
}
#[derive(Clone, Serialize, Default)]
pub struct CaptureContext {
    pub namespace: Option<String>,
    pub email: String,
}
type CaptureReply = oneshot::Sender<Result<(), String>>;
#[derive(Default)]
struct Inner {
    context: CaptureContext,
    pending: HashMap<String, CaptureReply>,
    today_requested: bool,
}
pub struct Desktop {
    inner: Mutex<Inner>,
    capture: MenuItem<tauri::Wry>,
    today: MenuItem<tauri::Wry>,
}
fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Ação disponível na janela principal.".into())
    }
}
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
fn show_capture(app: &AppHandle) -> Result<(), String> {
    let Some(state) = app.try_state::<Desktop>() else {
        show_main(app);
        return Ok(());
    };
    if state
        .inner
        .lock()
        .map_err(|_| "Bandeja ocupada.")?
        .context
        .namespace
        .is_none()
    {
        show_main(app);
        return Ok(());
    }
    let window = if let Some(window) = app.get_webview_window("capture") {
        window
    } else {
        WebviewWindowBuilder::new(
            app,
            "capture",
            WebviewUrl::App("index.html?capture=1".into()),
        )
        .title("Novo assunto · Zenit Day")
        .inner_size(460.0, 355.0)
        .min_inner_size(360.0, 355.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .center()
        .visible(false)
        .build()
        .map_err(|_| "Não foi possível abrir a captura rápida.")?
    };
    window
        .show()
        .map_err(|_| "Não foi possível mostrar a captura rápida.")?;
    let _ = window.set_focus();
    let _ = window.emit("desktop-capture-focus", ());
    Ok(())
}
pub fn dispatch(app: &AppHandle, action: &str) {
    match action {
        "capture" => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if show_capture(&app).is_err() {
                    show_main(&app);
                }
            });
        }
        "today" => {
            if let Some(state) = app.try_state::<Desktop>() {
                if let Ok(mut inner) = state.inner.lock() {
                    inner.today_requested = true;
                }
            }
            show_main(app);
            let _ = app.emit_to("main", "desktop-action", ());
        }
        "quit" => app.exit(0),
        _ => show_main(app),
    }
}
pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let capture = MenuItem::with_id(app, "capture", "Novo assunto…", false, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "Ver Hoje", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Abrir Zenit Day", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do aplicativo", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&capture, &today, &open, &separator, &quit])?;
    app.manage(Desktop {
        inner: Mutex::new(Inner::default()),
        capture,
        today,
    });
    TrayIconBuilder::with_id("zenit-day")
        .icon(
            app.default_window_icon()
                .ok_or("Ícone indisponível.")?
                .clone(),
        )
        .tooltip("Zenit Day")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| dispatch(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    // Only autostart is quiet. A normal launch always shows the main window.
    if std::env::args().any(|arg| arg == "--background") {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }
    Ok(())
}
pub fn on_close(window: &tauri::Window, api: &tauri::CloseRequestApi) {
    if matches!(window.label(), "main" | "capture") {
        api.prevent_close();
        let _ = window.hide();
    }
}
#[tauri::command]
pub fn desktop_preferences(app: AppHandle, window: WebviewWindow) -> Result<Preferences, String> {
    main_only(&window)?;
    Ok(Preferences {
        autostart: app
            .autolaunch()
            .is_enabled()
            .map_err(|_| "Não foi possível consultar a inicialização do Windows.")?,
    })
}
#[tauri::command]
pub fn desktop_set_preference(
    app: AppHandle,
    window: WebviewWindow,
    key: String,
    enabled: bool,
) -> Result<Preferences, String> {
    main_only(&window)?;
    match key.as_str() {
        "autostart" => {
            let result = if enabled {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            result.map_err(|_| "Não foi possível alterar a inicialização do Windows.")?;
        }
        _ => return Err("Preferência desconhecida.".into()),
    }
    desktop_preferences(app, window)
}
#[tauri::command]
pub fn desktop_status(
    app: AppHandle,
    window: WebviewWindow,
    namespace: Option<String>,
    email: String,
    today_count: u32,
    status: String,
) -> Result<(), String> {
    main_only(&window)?;
    let state = app.state::<Desktop>();
    let ready = namespace.is_some();
    let changed = {
        let mut inner = state.inner.lock().map_err(|_| "Bandeja ocupada.")?;
        let changed = inner.context.namespace != namespace;
        if changed {
            for (_, reply) in inner.pending.drain() {
                let _ = reply.send(Err("A conta mudou. Abra novamente a captura rápida.".into()));
            }
        }
        inner.context = CaptureContext { namespace, email };
        changed
    };
    let _ = state.capture.set_enabled(ready);
    let _ = state.today.set_enabled(ready);
    let _ = state.today.set_text(if ready {
        format!("Ver Hoje ({today_count})")
    } else {
        "Ver Hoje".into()
    });
    if let Some(tray) = app.tray_by_id("zenit-day") {
        let text = if ready {
            format!(
                "Zenit Day · Hoje: {today_count} · {}",
                status.chars().take(65).collect::<String>()
            )
        } else {
            "Zenit Day · Entre no seu espaço".into()
        };
        let _ = tray.set_tooltip(Some(text));
    }
    if changed {
        if let Some(capture) = app.get_webview_window("capture") {
            let _ = capture.hide();
            let _ = capture.emit("desktop-capture-context", ());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn desktop_take_today(app: AppHandle, window: WebviewWindow) -> Result<bool, String> {
    main_only(&window)?;
    let state = app.state::<Desktop>();
    let mut inner = state.inner.lock().map_err(|_| "Bandeja ocupada.")?;
    Ok(std::mem::take(&mut inner.today_requested))
}
#[tauri::command]
pub async fn desktop_open_capture(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    main_only(&window)?;
    show_capture(&app)
}
#[tauri::command]
pub fn desktop_capture_context(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<CaptureContext, String> {
    if window.label() != "capture" {
        return Err("Janela inválida.".into());
    }
    Ok(app
        .state::<Desktop>()
        .inner
        .lock()
        .map_err(|_| "Bandeja ocupada.")?
        .context
        .clone())
}
#[tauri::command]
pub fn desktop_close_capture(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "capture" {
        return Err("Janela inválida.".into());
    }
    window
        .hide()
        .map_err(|_| "Não foi possível fechar a captura.".into())
}
#[derive(Clone, Serialize)]
struct CaptureRequest {
    id: String,
    namespace: String,
    title: String,
    priority: String,
}
#[tauri::command]
pub async fn desktop_capture_submit(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    namespace: String,
    title: String,
    priority: String,
) -> Result<(), String> {
    if window.label() != "capture" {
        return Err("Janela inválida.".into());
    }
    if id.len() != 36
        || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        || title.trim().is_empty()
        || title.chars().count() > 200
    {
        return Err("Informe um assunto com até 200 caracteres.".into());
    }
    if !matches!(priority.as_str(), "low" | "normal" | "important" | "urgent") {
        return Err("Escolha uma prioridade válida.".into());
    }
    let (sender, receiver) = oneshot::channel();
    {
        let state = app.state::<Desktop>();
        let mut inner = state.inner.lock().map_err(|_| "Bandeja ocupada.")?;
        if inner.context.namespace.as_ref() != Some(&namespace) {
            return Err("A conta mudou. Abra novamente a captura rápida.".into());
        }
        if !inner.pending.is_empty() {
            return Err("Aguarde a gravação em andamento.".into());
        }
        inner.pending.insert(id.clone(), sender);
    }
    let request = CaptureRequest {
        id: id.clone(),
        namespace,
        title: title.trim().into(),
        priority,
    };
    let result = if app.emit_to("main", "desktop-capture", request).is_err() {
        Err("Abra o aplicativo e tente novamente.".into())
    } else {
        match tokio::time::timeout(std::time::Duration::from_secs(30), receiver).await {
            Ok(Ok(result)) => result,
            _ => Err(
                "A gravação ainda não foi confirmada. Seu texto foi mantido; tente novamente."
                    .into(),
            ),
        }
    };
    app.state::<Desktop>()
        .inner
        .lock()
        .map_err(|_| "Bandeja ocupada.")?
        .pending
        .remove(&id);
    result
}
#[tauri::command]
pub fn desktop_capture_finish(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    error: Option<String>,
) -> Result<(), String> {
    main_only(&window)?;
    if let Some(reply) = app
        .state::<Desktop>()
        .inner
        .lock()
        .map_err(|_| "Bandeja ocupada.")?
        .pending
        .remove(&id)
    {
        let _ = reply.send(error.map_or(Ok(()), Err));
    }
    Ok(())
}
