import { describe, expect, it } from "vitest";
import {
  blankReminder,
  enqueueReminder,
  fromLocalDateTime,
  localDateTime,
  reminderDocument,
  resolveReminderConflict,
  validateReminder,
  type Reminder,
  type ReminderOperation,
} from "./reminders";
import { emptyWorkspace, parseBackup, type Workspace } from "./model";
import { Repository, type Persistence, type Stored } from "./storage";
import { Synchronizer } from "./sync";
import type { Api } from "./api";
const user = "11111111-1111-4111-8111-111111111111",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function disk(): Persistence {
  let stored: Stored = { version: 0, data: emptyWorkspace() };
  return {
    async read() {
      return structuredClone(stored);
    },
    async write(_key, version, data) {
      if (version !== stored.version) throw new Error("stale");
      stored = { version: version + 1, data: structuredClone(data) };
      return stored.version;
    },
  };
}
function remote() {
  let row: Reminder | null = null,
    lost = false,
    writes = 0;
  const receipts = new Map<string, Reminder>();
  return {
    remindersSupported: true,
    session: { user: { id: user } },
    async ready() {},
    async subjects() {
      return [];
    },
    async history() {
      return [];
    },
    async reminders() {
      return row ? [structuredClone(row)] : [];
    },
    lose() {
      lost = true;
    },
    get writes() {
      return writes;
    },
    async saveReminder(op: ReminderOperation) {
      if (receipts.has(op.id))
        return { result: "saved", reminder: receipts.get(op.id) };
      if ((row?.revision ?? 0) !== op.expectedRevision)
        return { result: "conflict", reminder: structuredClone(row) };
      row = {
        ...structuredClone(op.doc),
        id: op.reminderId,
        user_id: user,
        revision: op.expectedRevision + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      receipts.set(op.id, structuredClone(row));
      writes++;
      if (lost) {
        lost = false;
        throw new Error("Lost acknowledgement");
      }
      return { result: "saved", reminder: structuredClone(row) };
    },
  };
}
const doc = () => ({ ...blankReminder(), title: "Lançar horas" });
describe("reminder management", () => {
  it("persists offline, retries lost replies once and synchronizes pause, resume and deletion", async () => {
    const storage = disk(),
      api = remote();
    const initial = await new Repository("u", storage).load();
    await initial.mutate((w) => enqueueReminder(w, user, id, doc()));
    const repo = await new Repository("u", storage).load();
    const sync = new Synchronizer(repo, api as unknown as Api, user);
    api.lose();
    await expect(sync.run()).rejects.toThrow("Lost acknowledgement");
    await sync.run();
    expect(api.writes).toBe(1);
    expect(repo.current.reminders!.queue).toHaveLength(0);
    for (const enabled of [false, true]) {
      await repo.mutate((w) =>
        enqueueReminder(w, user, id, {
          ...reminderDocument(w.reminders!.rows[id]),
          enabled,
        }),
      );
      await sync.run();
      expect((await api.reminders())[0].enabled).toBe(enabled);
    }
    const other = await new Repository("other", disk()).load();
    await new Synchronizer(other, api as unknown as Api, user).run();
    expect(other.current.reminders!.rows[id].title).toBe("Lançar horas");
    await repo.mutate((w) =>
      enqueueReminder(w, user, id, {
        ...reminderDocument(w.reminders!.rows[id]),
        enabled: false,
        deleted: true,
      }),
    );
    await sync.run();
    await new Synchronizer(other, api as unknown as Api, user).run();
    expect(other.current.reminders!.rows[id].deleted).toBe(true);
  });
  it("holds concurrent versions for explicit resolution and never changes the operation on a retry", async () => {
    const api = remote(),
      repo = await new Repository("u", disk()).load();
    const sync = new Synchronizer(repo, api as unknown as Api, user);
    await repo.mutate((w) => enqueueReminder(w, user, id, doc()));
    await sync.run();
    await api.saveReminder({
      id: crypto.randomUUID(),
      reminderId: id,
      expectedRevision: 1,
      doc: { ...doc(), title: "Na nuvem" },
    });
    await repo.mutate((w) =>
      enqueueReminder(w, user, id, { ...doc(), title: "No dispositivo" }),
    );
    await sync.run();
    expect(repo.current.reminders!.conflicts[id]?.title).toBe("Na nuvem");
    expect(repo.current.reminders!.rows[id].title).toBe("No dispositivo");
    await repo.mutate((w) => resolveReminderConflict(w, user, id, "local"));
    await sync.run();
    expect((await api.reminders())[0]).toMatchObject({
      title: "No dispositivo",
      revision: 3,
    });
  });
  it("preserves pending changes when the database is old and refuses another user's response", async () => {
    const api = remote(),
      repo = await new Repository("u", disk()).load();
    await repo.mutate((w) => enqueueReminder(w, user, id, doc()));
    api.remindersSupported = false;
    const sync = new Synchronizer(repo, api as unknown as Api, user);
    await expect(sync.run()).rejects.toThrow("atualização Lembretes");
    expect(repo.current.reminders!.queue).toHaveLength(1);
    api.remindersSupported = true;
    await sync.run();
    const original = api.reminders;
    api.reminders = async () =>
      (await original()).map((r) => ({ ...r, user_id: "other" }));
    await expect(sync.run()).rejects.toThrow("inválido");
    expect(repo.current.reminders!.rows[id].user_id).toBe(user);
  });
  it("round trips local clock times, rejects invalid schedules and includes offline reminders in backups", () => {
    const iso = fromLocalDateTime("2026-10-02T07:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-10-02T10:00:00.000Z");
    expect(localDateTime(iso, "America/Sao_Paulo")).toBe("2026-10-02T07:00");
    expect(() =>
      fromLocalDateTime("2026-03-08T02:30", "America/New_York"),
    ).toThrow("não existe");
    for (const patch of [
      { times: ["155:00"] },
      { intervalMinutes: 0 },
      { monthDay: 32 },
      { windowStart: "18:00", windowEnd: "08:00" },
    ])
      expect(() =>
        validateReminder({
          ...doc(),
          schedule: { ...doc().schedule, ...patch },
        }),
      ).toThrow();
    const w: Workspace = emptyWorkspace();
    enqueueReminder(w, user, id, doc());
    const backup = JSON.stringify({
      format: "zenit-day",
      version: 1,
      userId: user,
      project: "project",
      workspace: w,
    });
    expect(
      parseBackup(backup, user, "project").workspace.reminders!.rows[id].title,
    ).toBe("Lançar horas");
  });
});
