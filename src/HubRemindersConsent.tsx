import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import { config } from "./api";
import "./hub-consent.css";

export default function HubRemindersConsent() {
  const clientId = import.meta.env.VITE_HUB_CLIENT_ID || "";
  const supabase = useMemo(
    () =>
      config
        ? createClient(config.url, config.key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              storageKey: "zenit-day-reminder-consent",
            },
          })
        : null,
    [],
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [account, setAccount] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setPassword("");
      if (result.error || !result.data.user)
        throw new Error("Confira o e-mail e a senha do Day.");
      setAccount(result.data.user.email || email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(enabled: boolean) {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("zenit_day_set_reminder_consent", {
        p_client_id: clientId,
        p_enabled: enabled,
      });
      if (result.error || result.data?.enabled !== enabled)
        throw new Error(
          "Não foi possível salvar a autorização. Tente novamente.",
        );
      setDone(
        enabled
          ? "Autorização salva. Volte ao WhatsApp e envie “ativar lembretes do Day” para escolher e confirmar o envio. Autorizar aqui não assina notificações automaticamente."
          : "Acesso aos lembretes revogado. O Hub não poderá consultá-los nem alterá-los.",
      );
      // Keep the Hub's OAuth grant and other Day sessions valid.
      await supabase.auth.signOut({ scope: "local" });
      setAccount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="hub-consent-page">
      <section className="hub-consent-card">
        <p className="hub-consent-brand">ZENIT DAY</p>
        <h1>Lembretes no Zenit Hub</h1>
        {!supabase || !clientId ? (
          <p role="alert">Integração ainda não configurada.</p>
        ) : done ? (
          <p role="status">{done}</p>
        ) : account ? (
          <>
            <div className="hub-consent-account">
              <strong>{account}</strong>
              <span>Use a mesma conta conectada ao WhatsApp.</span>
            </div>
            <p>
              O Hub poderá consultar seus lembretes sincronizados, inclusive com
              o Day fechado, e criar, editar, pausar ou excluir lembretes
              mediante confirmação pelo botão no WhatsApp. Seus assuntos
              continuarão somente para leitura.
            </p>
            <p>
              Você escolhe o envio pelo WhatsApp separadamente. Pode revogar
              este acesso nesta página a qualquer momento.
            </p>
            <div className="hub-consent-actions">
              <button disabled={busy} onClick={() => void decide(false)}>
                Revogar acesso
              </button>
              <button
                className="hub-consent-primary"
                disabled={busy}
                onClick={() => void decide(true)}
              >
                Autorizar lembretes
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={login}>
            <p>
              Entre na conta do Day conectada ao Zenit Hub para autorizar ou
              revogar o acesso.
            </p>
            <label>
              E-mail
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <button className="hub-consent-primary" disabled={busy}>
              {busy ? "Entrando…" : "Continuar"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="hub-consent-error">
            {error}
          </p>
        )}
        <small>
          Sua senha é enviada somente ao Day. Esta autorização não conecta uma
          conta diferente à conversa.
        </small>
      </section>
    </main>
  );
}
