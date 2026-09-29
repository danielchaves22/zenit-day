import { describe, expect, it } from "vitest";
import {
  blankDoc,
  documentOf,
  emptyWorkspace,
  enqueue,
  parseBackup,
  resolveConflict,
  setDailyGoal,
  type Operation,
  type Subject,
  type Workspace,
} from "./model";
import { Repository, type Persistence, type Stored } from "./storage";
import { Synchronizer } from "./sync";
import type { Api } from "./api";
const user = "11111111-1111-4111-8111-111111111111";
const sid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function disk() {
  const records = new Map<string, Stored>();
  return {
    async read(k: string) {
      return structuredClone(
        records.get(k) ?? { version: 0, data: emptyWorkspace() },
      );
    },
    async write(k: string, version: number, data: Workspace) {
      if ((records.get(k)?.version ?? 0) !== version) throw new Error("stale");
      records.set(k, { version: version + 1, data: structuredClone(data) });
      return version + 1;
    },
  } satisfies Persistence;
}
function server() {
  let current: Subject | null = null;
  let lost = false;
  const receipts = new Map<string, Subject>();
  let writes = 0;
  return {
    session: { user: { id: user } },
    set subject(v: Subject | null) {
      current = v;
    },
    get subject() {
      return current;
    },
    get writes() {
      return writes;
    },
    loseResponse() {
      lost = true;
    },
    async ready() {},
    async save(op: Operation) {
      if (receipts.has(op.id))
        return { result: "saved", subject: receipts.get(op.id) };
      if (op.expectedRevision !== (current?.revision ?? 0))
        return { result: "conflict", subject: current };
      const now = new Date().toISOString();
      current = {
        ...op.doc,
        id: op.subjectId,
        user_id: user,
        revision: op.expectedRevision + 1,
        created_at: now,
        updated_at: now,
        completed_at: null,
      };
      receipts.set(op.id, structuredClone(current));
      writes++;
      if (lost) {
        lost = false;
        throw new Error("connection lost after commit");
      }
      return { result: "saved", subject: current };
    },
    async subjects() {
      return current ? [current] : [];
    },
    async history() {
      return [];
    },
  };
}
describe("offline persistence and synchronization", () => {
  it("persists a goal offline, retries lost acknowledgements and reaches another device", async () => {
    const storage = disk();
    const repo = await new Repository("a", storage).load();
    const remote = server();
    await repo.mutate((w) => enqueue(w, user, sid, blankDoc("Goal")));
    await new Synchronizer(repo, remote as unknown as Api, user).run();
    await repo.mutate((w) =>
      setDailyGoal(w, user, sid, "follow_up", "2026-09-28"),
    );
    const reopened = await new Repository("a", storage).load();
    expect(reopened.current.subjects[sid].daily_goal).toBe("follow_up");
    remote.loseResponse();
    await expect(
      new Synchronizer(reopened, remote as unknown as Api, user).run(),
    ).rejects.toThrow();
    await new Synchronizer(reopened, remote as unknown as Api, user).run();
    expect(remote.writes).toBe(2);
    const second = await new Repository("other-device", disk()).load();
    await new Synchronizer(second, remote as unknown as Api, user).run();
    expect(second.current.subjects[sid]).toMatchObject({
      daily_goal: "follow_up",
      daily_goal_on: "2026-09-28",
      status: "todo",
    });
  });
  it("persists subject and queue together, survives reopening, and isolates accounts", async () => {
    const storage = disk();
    const repo = await new Repository("project|alice", storage).load();
    await repo.mutate((w) =>
      enqueue(w, user, sid, blankDoc("Retomar contrato")),
    );
    const again = await new Repository("project|alice", storage).load();
    expect(again.current.subjects[sid].title).toBe("Retomar contrato");
    expect(again.current.queue).toHaveLength(1);
    expect(
      (await new Repository("project|bob", storage).load()).current.subjects,
    ).toEqual({});
  });
  it("does not update the interface snapshot when disk writing fails", async () => {
    const storage = disk();
    const repo = await new Repository("a", storage).load();
    storage.write = async () => {
      throw new Error("disk full");
    };
    await expect(
      repo.mutate((w) => enqueue(w, user, sid, blankDoc("unsaved"))),
    ).rejects.toThrow();
    expect(repo.current.queue).toHaveLength(0);
    expect(repo.current.subjects).toEqual({});
  });
  it("retries with the same operation after a committed response is lost", async () => {
    const storage = disk();
    const repo = await new Repository("a", storage).load();
    await repo.mutate((w) => enqueue(w, user, sid, blankDoc("Original")));
    const remote = server();
    remote.loseResponse();
    const sync = new Synchronizer(repo, remote as unknown as Api, user);
    await expect(sync.run()).rejects.toThrow();
    expect(repo.current.queue).toHaveLength(1);
    const reopened = await new Repository("a", storage).load();
    await new Synchronizer(reopened, remote as unknown as Api, user).run();
    expect(remote.writes).toBe(1);
    expect(reopened.current.queue).toHaveLength(0);
  });
  it("keeps a newer local edit when the previous request is acknowledged", async () => {
    const repo = await new Repository("a", disk()).load();
    await repo.mutate((w) => enqueue(w, user, sid, blankDoc("First")));
    const remote = server();
    const save = remote.save.bind(remote);
    let edited = false;
    remote.save = async (op) => {
      if (!edited) {
        edited = true;
        await repo.mutate((w) =>
          enqueue(w, user, sid, {
            ...documentOf(w.subjects[sid]),
            title: "Newer",
          }),
        );
      }
      return save(op);
    };
    await new Synchronizer(repo, remote as unknown as Api, user).run();
    expect(remote.subject?.title).toBe("Newer");
    expect(remote.subject?.revision).toBe(2);
    expect(repo.current.subjects[sid].title).toBe("Newer");
    expect(repo.current.queue).toHaveLength(0);
  });
  it("preserves both versions on conflict and resolves against the latest revision", async () => {
    const repo = await new Repository("a", disk()).load();
    const remote = server();
    const sync = new Synchronizer(repo, remote as unknown as Api, user);
    await repo.mutate((w) =>
      enqueue(w, user, sid, { ...blankDoc("Subject"), due_on: "2026-10-30" }),
    );
    await sync.run();
    remote.subject = {
      ...remote.subject!,
      revision: 2,
      situation: "Another device",
    };
    await repo.mutate((w) =>
      enqueue(
        w,
        user,
        sid,
        {
          ...documentOf(w.subjects[sid]),
          situation: "My offline note",
          review_on: "2026-10-01",
        },
        "My offline note",
      ),
    );
    await sync.run();
    expect(repo.current.subjects[sid].situation).toBe("My offline note");
    expect(repo.current.conflicts[sid].remote?.situation).toBe(
      "Another device",
    );
    await repo.mutate((w) => resolveConflict(w, user, sid, "local"));
    expect(repo.current.queue[0].expectedRevision).toBe(2);
    expect(repo.current.recovery[0].subject.situation).toBe("My offline note");
    await sync.run();
    expect(remote.subject?.situation).toBe("My offline note");
    expect(remote.subject?.due_on).toBe("2026-10-30");
    expect(remote.subject?.status).toBe("todo");
  });
  it("rejects remote records from another account without persisting them", async () => {
    const repo = await new Repository("a", disk()).load();
    const remote = server();
    await repo.mutate((w) => enqueue(w, user, sid, blankDoc("Private")));
    await new Synchronizer(repo, remote as unknown as Api, user).run();
    remote.subject = {
      ...remote.subject!,
      user_id: "22222222-2222-4222-8222-222222222222",
      title: "Forbidden",
    };
    await expect(
      new Synchronizer(repo, remote as unknown as Api, user).run(),
    ).rejects.toThrow();
    expect(repo.current.subjects[sid].title).toBe("Private");
  });
  it("exports all local state and restores subject copies without changing existing IDs", async () => {
    const repo = await new Repository("a", disk()).load();
    await repo.mutate((w) =>
      enqueue(w, user, sid, {
        ...blankDoc("Backup subject"),
        responsible_is_self: false,
        responsible_name: "Maria",
        due_on: "2026-10-30",
      }),
    );
    const json = JSON.stringify({
      format: "zenit-day",
      version: 1,
      userId: user,
      project: "https://example.supabase.co",
      exportedAt: new Date().toISOString(),
      workspace: repo.current,
    });
    expect(() =>
      parseBackup(json, "other", "https://example.supabase.co"),
    ).toThrow();
    const b = parseBackup(json, user, "https://example.supabase.co");
    expect(b.workspace.queue).toHaveLength(1);
    await repo.mutate((w) => {
      for (const s of Object.values(b.workspace.subjects))
        enqueue(w, user, crypto.randomUUID(), documentOf(s), "Restaurado");
    });
    expect(Object.values(repo.current.subjects)).toHaveLength(2);
    expect(
      Object.values(repo.current.subjects).every(
        (s) => s.responsible_name === "Maria" && s.due_on === "2026-10-30",
      ),
    ).toBe(true);
  });
});
