import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  desktopAvailable,
  desktopError,
  type DesktopPreferences,
} from "./desktop";

export function WindowsSettings() {
  const [preferences, setPreferences] = useState<DesktopPreferences | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktopAvailable)
      void invoke<DesktopPreferences>("desktop_preferences")
        .then(setPreferences)
        .catch((e) => setError(desktopError(e)));
  }, []);
  if (!desktopAvailable) return null;
  async function change(key: keyof DesktopPreferences, enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      setPreferences(await invoke("desktop_set_preference", { key, enabled }));
    } catch (e) {
      setError(desktopError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-section windows-settings">
      <h3>No Windows</h3>
      <p className="muted">
        Ao fechar a janela, o Zenit Day continua na bandeja. Para encerrar, use
        “Sair do aplicativo” no menu do ícone.
      </p>
      <label>
        <input
          type="checkbox"
          checked={preferences?.autostart ?? false}
          disabled={!preferences || busy}
          onChange={(e) => void change("autostart", e.target.checked)}
        />
        <span>
          Iniciar com o Windows
          <small>Inicia discretamente na bandeja ao entrar no Windows.</small>
        </span>
      </label>
      <button
        className="button"
        onClick={() => {
          void invoke("desktop_open_capture").catch((e) =>
            setError(desktopError(e)),
          );
        }}
      >
        Abrir captura rápida
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
