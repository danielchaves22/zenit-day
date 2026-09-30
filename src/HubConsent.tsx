import { useMemo, useState, type FormEvent } from "react";
import { createClient, type OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { config } from "./api";
import { allowedHubRedirect } from "./hub-authorization";
import "./hub-consent.css";

export default function HubConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id") || "";
  const clientId = import.meta.env.VITE_HUB_CLIENT_ID || "";
  const hubOrigin = import.meta.env.VITE_HUB_PUBLIC_URL || "";
  const supabase = useMemo(() => config ? createClient(config.url, config.key, { auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    storageKey: "zenit-day-hub-consent",
  } }) : null, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = Boolean(config && clientId && hubOrigin && /^[A-Za-z0-9_-]{1,256}$/.test(authorizationId));

  async function login(event: FormEvent) {
    event.preventDefault(); if (!supabase || !valid || busy) return;
    setBusy(true); setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setPassword("");
      if (loginError) throw new Error("Não foi possível entrar. Confira a conta e a senha do Day.");
      const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (authError || !data) throw new Error("A solicitação expirou ou não está disponível. Peça um novo link pelo WhatsApp.");
      if ("redirect_url" in data) { window.location.assign(allowedHubRedirect(data.redirect_url, hubOrigin)); return; }
      if (data.client.id !== clientId) throw new Error("Esta solicitação não pertence ao Zenit Hub configurado.");
      allowedHubRedirect(data.redirect_uri, hubOrigin);
      if (data.scope.split(" ").some(scope => !["email", "openid", "profile"].includes(scope))) throw new Error("A solicitação contém permissões não previstas.");
      setDetails(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível continuar."); }
    finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (!supabase || !details || busy) return;
    setBusy(true); setError("");
    try {
      const { data, error } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error || !data) throw new Error("Não foi possível concluir a autorização. Tente novamente.");
      window.location.assign(allowedHubRedirect(data.redirect_url, hubOrigin));
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível continuar."); setBusy(false); }
  }
  return <main className="hub-consent-page"><section className="hub-consent-card">
    <p className="hub-consent-brand">ZENIT DAY</p>
    <h1>Conectar ao Zenit Hub</h1>
    <p>Consulte seus assuntos na mesma conversa em que você usa suas outras aplicações.</p>
    {!valid ? <p role="alert">Esta integração ainda não está configurada ou o link é inválido. Volte à conversa no WhatsApp.</p>
      : details ? <>
        <div className="hub-consent-account"><strong>{details.user.email}</strong><span>Conta do Zenit Day</span></div>
        <p>O Hub poderá consultar seus assuntos, próximos passos, retomadas e prazos. Esta versão oferece acesso somente para leitura.</p>
        <p>Depois de autorizar, confirme esta conta na conversa do WhatsApp.</p>
        <div className="hub-consent-actions"><button type="button" disabled={busy} onClick={() => void decide(false)}>Cancelar</button>
          <button type="button" className="hub-consent-primary" disabled={busy} onClick={() => void decide(true)}>{busy ? "Aguarde…" : "Autorizar conexão"}</button></div>
      </> : <form onSubmit={login}>
        <p>Entre na conta do Day que deseja conectar. Ela pode ser diferente das contas das outras aplicações.</p>
        <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
        <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
        <button className="hub-consent-primary" type="submit" disabled={busy}>{busy ? "Entrando…" : "Continuar"}</button>
      </form>}
    {error && <p className="hub-consent-error" role="alert">{error}</p>}
    <small>A autorização é feita pelo Day. Sua senha não é enviada ao Hub nem ao WhatsApp.</small>
  </section></main>;
}
