import { afterEach, expect, it, vi } from "vitest";
import { Api, LoginRequired, type Session } from "./api";
import { secureSession } from "./storage";
import { blankDoc, type Operation } from "./model";
const config = {
  url: "https://test.supabase.co",
  key: "sb_publishable_synthetic",
};
const session: Session = {
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  expires_at: 1,
  user: { id: "alice", email: "alice@example.test" },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("holds subgroup requests until the server supports groups without rewriting legacy payloads", async () => {
  const api = new Api(config);
  api.session = { ...session, expires_at: Date.now() / 1000 + 3600 };
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          application: "zenit-day",
          schema_version: 1,
          daily_goals: true,
          checklist: true,
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await api.ready();
  const op: Operation = {
    id: "op",
    subjectId: "s",
    expectedRevision: 0,
    doc: { ...blankDoc("S"), project: "Trabalho", subgroup: "Cliente" },
    note: null,
    createdAt: "now",
  };
  const before = JSON.stringify(op);
  await expect(api.save(op)).rejects.toThrow("atualização Grupos");
  expect(JSON.stringify(op)).toBe(before);
  expect(fetch).toHaveBeenCalledTimes(1);
  delete op.doc.subgroup;
  await api.save(op);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(fetch.mock.calls[1][1]?.body as string).p_subject,
  ).not.toHaveProperty("subgroup");
});
it("holds checklist operations intact until the server supports them", async () => {
  const api = new Api(config);
  api.session = { ...session, expires_at: Date.now() / 1000 + 3600 };
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        application: "zenit-day",
        schema_version: 1,
        daily_goals: true,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  await api.ready();
  const op: Operation = {
    id: "op",
    subjectId: "subject",
    expectedRevision: 0,
    doc: blankDoc("Checklist"),
    note: null,
    createdAt: "now",
  };
  const before = JSON.stringify(op);
  await expect(api.save(op)).rejects.toThrow("atualização Checklist");
  expect(JSON.stringify(op)).toBe(before);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps goals local until the database supports them, without changing their queued payload", async () => {
  const api = new Api(config);
  api.session = { ...session, expires_at: Date.now() / 1000 + 3600 };
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ application: "zenit-day", schema_version: 1 }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await api.ready();
  const op: Operation = {
    id: "operation",
    subjectId: "subject",
    expectedRevision: 0,
    doc: {
      ...blankDoc("Subject"),
      daily_goal: "finish",
      daily_goal_on: "2026-09-28",
    },
    note: null,
    createdAt: "now",
  };
  const payload = JSON.stringify(op);
  await expect(api.save(op)).rejects.toThrow("atualização Meta de hoje");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(op)).toBe(payload);
});
it("keeps offline identity and data accessible when refresh fails", async () => {
  const api = new Api(config);
  api.session = structuredClone(session);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(api.token()).rejects.toThrow("Sem conexão");
  expect(api.session?.user.id).toBe("alice");
  expect(api.session?.refresh_token).toBe(session.refresh_token);
});
it("serializes token refresh and stores one protected replacement", async () => {
  const api = new Api(config);
  api.session = structuredClone(session);
  const write = vi.spyOn(secureSession, "write").mockResolvedValue();
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ...session,
        access_token: "replacement",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await Promise.all([api.token(), api.token()])).toEqual([
    "replacement",
    "replacement",
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
});
it("rejects a refresh identity change", async () => {
  const api = new Api(config);
  api.session = structuredClone(session);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...session,
          user: { id: "bob", email: "bob@example.test" },
        }),
      ),
    ),
  );
  await expect(api.token()).rejects.toBeInstanceOf(LoginRequired);
  expect(api.session?.user.id).toBe("alice");
});
it("does not resurrect a session if logout occurs during refresh", async () => {
  const api = new Api(config);
  api.session = structuredClone(session);
  vi.spyOn(secureSession, "write").mockResolvedValue();
  let release!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      url.includes("grant_type=refresh_token")
        ? new Promise((r) => {
            release = r;
          })
        : Promise.resolve(new Response("{}")),
    ),
  );
  const refresh = api.token();
  const failure = expect(refresh).rejects.toThrow("A conta foi alterada");
  await api.logout();
  release(
    new Response(
      JSON.stringify({
        ...session,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
  );
  await failure;
  expect(api.session).toBeNull();
  expect(secureSession.write).toHaveBeenLastCalledWith(config.url, null);
});
