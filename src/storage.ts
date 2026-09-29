import { invoke, isTauri } from "@tauri-apps/api/core";
import { emptyWorkspace, type Workspace } from "./model";
export const native = isTauri();
export interface Stored {
  version: number;
  data: Workspace;
}
export interface Persistence {
  read(key: string): Promise<Stored>;
  write(key: string, expected: number, data: Workspace): Promise<number>;
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("zenit-day-preview", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("workspaces");
    req.onerror = () =>
      reject(new Error("Não foi possível abrir o armazenamento local."));
    req.onsuccess = () => resolve(req.result);
  }));
}
export const persistence: Persistence = {
  async read(key) {
    if (native) {
      const r = await invoke<{ version: number; data: string | null }>(
        "workspace_read",
        { namespace: key },
      );
      return {
        version: r.version,
        data: r.data ? JSON.parse(r.data) : emptyWorkspace(),
      };
    }
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("workspaces", "readonly");
      const req = tx.objectStore("workspaces").get(key);
      req.onsuccess = () =>
        resolve(req.result ?? { version: 0, data: emptyWorkspace() });
      req.onerror = () => reject(new Error("Falha ao ler os dados locais."));
    });
  },
  async write(key, expected, data) {
    if (native)
      return invoke<number>("workspace_write", {
        namespace: key,
        expected,
        data: JSON.stringify(data),
      });
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("workspaces", "readwrite");
      const store = tx.objectStore("workspaces");
      const req = store.get(key);
      let mismatch = false;
      req.onsuccess = () => {
        if ((req.result?.version ?? 0) !== expected) {
          mismatch = true;
          tx.abort();
          return;
        }
        store.put({ version: expected + 1, data }, key);
      };
      tx.oncomplete = () => resolve(expected + 1);
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            mismatch
              ? "Os dados mudaram em outra janela. Reabra esta janela antes de continuar."
              : "Não foi possível salvar. Verifique o espaço disponível.",
          ),
        );
    });
  },
};
export class Repository {
  current: Workspace = emptyWorkspace();
  private version = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(
    readonly key: string,
    private disk: Persistence = persistence,
  ) {}
  async load() {
    const stored = await this.disk.read(this.key);
    if (stored.data.schema !== 1)
      throw new Error("Este armazenamento usa uma versão incompatível.");
    this.current = stored.data;
    this.version = stored.version;
    return this;
  }
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.current;
  mutate(change: (draft: Workspace) => void): Promise<void> {
    const operation = this.tail.then(async () => {
      const next = structuredClone(this.current);
      change(next);
      const version = await this.disk.write(this.key, this.version, next);
      this.version = version;
      this.current = next;
      this.listeners.forEach((fn) => fn());
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
let transientSession: string | null = null;
export const secureSession = {
  async read(key: string): Promise<string | null> {
    return native
      ? invoke("session_read", { namespace: key })
      : transientSession;
  },
  async write(key: string, value: string | null) {
    if (native) await invoke("session_write", { namespace: key, value });
    else transientSession = value;
  },
};
export async function exportFile(text: string) {
  const name = `Zenit-Day-${new Date().toISOString().slice(0, 10)}.json`;
  if (native) return invoke<boolean>("export_backup", { name, contents: text });
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export async function importFile(): Promise<string | null> {
  if (native) return invoke("import_backup");
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () =>
      resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
