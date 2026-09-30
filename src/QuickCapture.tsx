import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Sunrise } from "lucide-react";
import { desktopError, type CaptureContext } from "./desktop";
import { priorities, type Priority } from "./model";
import { PriorityPicker } from "./PriorityPicker";

type Draft = { id: string; title: string; priority: Priority };
const fresh = (): Draft => ({
  id: crypto.randomUUID(),
  title: "",
  priority: "normal",
});
const draftKey = (namespace: string) => "zenit-day:capture-draft:" + namespace;
export function QuickCapture() {
  const [context, setContext] = useState<CaptureContext | null>(null);
  const [draft, setDraft] = useState<Draft>(fresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  async function loadContext() {
    const next = await invoke<CaptureContext>("desktop_capture_context");
    let restored = fresh();
    if (next.namespace) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(draftKey(next.namespace)) ?? "null",
        );
        if (
          saved &&
          typeof saved.id === "string" &&
          typeof saved.title === "string"
        )
          restored = {
            id: saved.id,
            title: saved.title,
            priority:
              typeof saved.priority === "string" &&
              Object.hasOwn(priorities, saved.priority)
                ? saved.priority
                : "normal",
          };
      } catch {
        /* A damaged draft does not prevent a new capture. */
      }
    }
    setContext(next);
    setDraft(restored);
    setError("");
    requestAnimationFrame(() => input.current?.focus());
  }
  useEffect(() => {
    const window = getCurrentWebviewWindow();
    const listeners = [
      window.listen("desktop-capture-context", () => {
        void loadContext().catch((e) => setError(desktopError(e)));
      }),
      window.listen("desktop-capture-focus", () => {
        input.current?.focus();
      }),
    ];
    void loadContext().catch((e) => setError(desktopError(e)));
    return () => {
      listeners.forEach((p) => {
        void p.then((fn) => fn());
      });
    };
  }, []);
  function change(title: string, priority = draft.priority) {
    const next = {
      id: title ? draft.id : crypto.randomUUID(),
      title,
      priority,
    };
    setDraft(next);
    if (context?.namespace) {
      try {
        localStorage.setItem(draftKey(context.namespace), JSON.stringify(next));
      } catch {
        setError(
          "Não foi possível preservar o rascunho. Mantenha esta janela aberta até salvar.",
        );
      }
    }
  }
  async function close() {
    if (!saving.current) await invoke("desktop_close_capture");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !context?.namespace || !draft.title.trim()) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await invoke("desktop_capture_submit", {
        ...draft,
        namespace: context.namespace,
      });
      localStorage.removeItem(draftKey(context.namespace));
      setDraft(fresh());
      await invoke("desktop_close_capture");
    } catch (e) {
      setError(desktopError(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <main
      className="quick-capture-window"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          void close();
        }
      }}
    >
      <div className="capture-brand">
        <Sunrise size={23} />
        <strong>Novo assunto</strong>
        <span>Zenit Day</span>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="capture-title">
          O que você precisa fazer ou acompanhar?
        </label>
        <input
          ref={input}
          id="capture-title"
          autoFocus
          maxLength={200}
          placeholder="Anote algo para hoje…"
          value={draft.title}
          onChange={(e) => change(e.target.value)}
          disabled={busy || !context?.namespace}
        />
        <PriorityPicker
          value={draft.priority}
          onChange={(priority) => change(draft.title, priority)}
          disabled={busy || !context?.namespace}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!error && (
          <p className="capture-hint">
            {context?.namespace
              ? "Para hoje · Sem grupo · Salvo mesmo sem internet"
              : "Entre na sua conta pela janela principal."}
          </p>
        )}
        <div className="capture-actions">
          <span title={context?.email}>{context?.email}</span>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => {
              void close();
            }}
          >
            Fechar
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={busy || !context?.namespace || !draft.title.trim()}
          >
            {busy ? "Salvando…" : "Salvar e fechar"}
          </button>
        </div>
        <small className="capture-shortcuts">
          Enter para salvar · Esc para fechar
        </small>
      </form>
    </main>
  );
}
