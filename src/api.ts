import { secureSession } from "./storage";
import { type Operation, type Subject, type Update } from "./model";
export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email: string };
}
export class LoginRequired extends Error {
  constructor() {
    super(
      "Sua sessão precisa ser renovada. Entre novamente; seu trabalho local está salvo.",
    );
  }
}
export const config = (() => {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL);
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.port ||
      url.username ||
      url.password ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
    )
      return null;
    return { url: url.origin, key };
  } catch {
    return null;
  }
})();
export class Api {
  session: Session | null = null;
  private dailyGoalsSupported = false;
  private checklistSupported = false;
  private groupsSupported = false;
  private refreshPromise: Promise<Session> | null = null;
  private epoch = 0;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly project: { url: string; key: string }) {}
  async restore() {
    const text = await secureSession.read(this.project.url);
    if (text) {
      const s = JSON.parse(text);
      if (
        typeof s?.user?.id !== "string" ||
        typeof s.refresh_token !== "string" ||
        typeof s.access_token !== "string"
      )
        throw new Error("Sessão local inválida.");
      this.session = s;
    }
    return this.session;
  }
  private async request(path: string, options: RequestInit = {}) {
    let r: Response;
    try {
      r = await fetch(this.project.url + path, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          apikey: this.project.key,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
    } catch {
      throw new Error(
        "Sem conexão com o serviço. Seu trabalho continua salvo neste dispositivo.",
      );
    }
    return r;
  }
  private async store(data: Session, epoch: number) {
    const s: Session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: { id: data.user.id, email: data.user.email },
    };
    if (
      typeof s.access_token !== "string" ||
      typeof s.refresh_token !== "string" ||
      typeof s.user.id !== "string" ||
      typeof s.user.email !== "string" ||
      !Number.isFinite(s.expires_at)
    )
      throw new Error("Resposta de autenticação inválida.");
    const operation = this.writes.then(async () => {
      if (epoch !== this.epoch)
        throw new Error("A conta foi alterada. Entre novamente.");
      await secureSession.write(this.project.url, JSON.stringify(s));
      if (epoch !== this.epoch)
        throw new Error("A conta foi alterada. Entre novamente.");
      this.session = s;
      return s;
    });
    this.writes = operation.catch(() => {});
    return operation;
  }
  async login(email: string, password: string) {
    const epoch = ++this.epoch;
    const r = await this.request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!r.ok)
      throw new Error(
        r.status === 400 || r.status === 401
          ? "Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta."
          : "O serviço de login está indisponível. Tente novamente.",
      );
    const data = await r.json();
    return this.store(
      {
        ...data,
        expires_at:
          data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
      },
      epoch,
    );
  }
  async token(): Promise<string> {
    const s = this.session;
    if (!s) throw new LoginRequired();
    if (s.expires_at > Date.now() / 1000 + 60) return s.access_token;
    if (!this.refreshPromise) {
      const epoch = this.epoch;
      this.refreshPromise = (async () => {
        const r = await this.request(
          "/auth/v1/token?grant_type=refresh_token",
          {
            method: "POST",
            body: JSON.stringify({ refresh_token: s.refresh_token }),
          },
        );
        if (r.status === 400 || r.status === 401) throw new LoginRequired();
        if (!r.ok) throw new Error("Não foi possível renovar a sessão agora.");
        const d = await r.json();
        if (d.user?.id !== s.user.id) throw new LoginRequired();
        return this.store(
          {
            ...d,
            expires_at:
              d.expires_at ?? Math.floor(Date.now() / 1000) + d.expires_in,
          },
          epoch,
        );
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    return (await this.refreshPromise).access_token;
  }
  async logout() {
    const old = this.session;
    ++this.epoch;
    const operation = this.writes.then(() =>
      secureSession.write(this.project.url, null),
    );
    this.writes = operation.catch(() => {});
    await operation;
    this.session = null;
    if (old)
      void this.request("/auth/v1/logout?scope=local", {
        method: "POST",
        headers: { Authorization: `Bearer ${old.access_token}` },
      }).catch(() => {});
  }
  private async authorized(path: string, options: RequestInit = {}) {
    const token = await this.token();
    const r = await this.request(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) throw new LoginRequired();
    if (!r.ok)
      throw new Error(
        `Não foi possível sincronizar (HTTP ${r.status}). As alterações permanecem salvas; confira a preparação do Supabase.`,
      );
    return r.json();
  }
  async ready() {
    const r = await this.authorized("/rest/v1/rpc/zenit_day_connection_check", {
      method: "POST",
      body: "{}",
    });
    if (r.application !== "zenit-day" || r.schema_version !== 1)
      throw new Error("O banco precisa da configuração do Zenit Day.");
    this.dailyGoalsSupported = r.daily_goals === true;
    this.checklistSupported = r.checklist === true;
    this.groupsSupported = r.groups === true;
  }
  async save(
    op: Operation,
  ): Promise<{ result: "saved" | "conflict"; subject: Subject | null }> {
    if (
      !this.dailyGoalsSupported &&
      ("daily_goal" in op.doc || "daily_goal_on" in op.doc)
    )
      throw new Error(
        "Falta aplicar a atualização Meta de hoje no Supabase. Suas alterações estão salvas neste dispositivo; sincronize novamente após a atualização.",
      );
    if (!this.checklistSupported && "checklist" in op.doc)
      throw new Error(
        "Falta aplicar a atualização Checklist no Supabase. Suas alterações estão salvas neste dispositivo; sincronize novamente após a atualização.",
      );
    if (!this.groupsSupported && "subgroup" in op.doc)
      throw new Error(
        "Falta aplicar a atualização Grupos no Supabase. Suas alterações estão salvas neste dispositivo; sincronize novamente após a atualização.",
      );
    return this.authorized("/rest/v1/rpc/zenit_day_save_subject", {
      method: "POST",
      body: JSON.stringify({
        p_operation_id: op.id,
        p_subject_id: op.subjectId,
        p_expected_revision: op.expectedRevision,
        p_subject: op.doc,
        p_note: op.note,
      }),
    });
  }
  async all<T>(table: string): Promise<T[]> {
    const result: T[] = [];
    let after = "";
    for (;;) {
      const rows = await this.authorized(
        `/rest/v1/${table}?select=*&order=id.asc&limit=500${after ? `&id=gt.${after}` : ""}`,
      );
      if (!Array.isArray(rows))
        throw new Error("Resposta de sincronização inválida.");
      result.push(...rows);
      if (rows.length < 500) return result;
      const next = rows.at(-1).id;
      if (typeof next !== "string" || next === after)
        throw new Error("Paginação inválida.");
      after = encodeURIComponent(next);
    }
  }
  subjects() {
    return this.all<Subject>("zenit_day_subjects");
  }
  history() {
    return this.all<Update>("zenit_day_updates");
  }
}
