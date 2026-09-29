import { describe, expect, it } from "vitest";
import {
  acknowledge,
  blankDoc,
  compareSubjects,
  completeSubject,
  documentOf,
  emptyWorkspace,
  enqueue,
  parseBackup,
  resolveConflict,
  setChecklistItem,
  validateDoc,
} from "./model";
const user = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function workspace() {
  const w = emptyWorkspace();
  enqueue(w, user, id, {
    ...blankDoc("Preparar entrega"),
    status: "doing",
    due_on: "2026-10-20",
    checklist: [{ id: itemId, text: "Revisar proposta", done: false }],
  });
  return w;
}
describe("subject checklist", () => {
  it("changes only the requested item, preserves queued snapshots and never completes the subject automatically", () => {
    const w = workspace();
    setChecklistItem(w, user, id, itemId, true);
    expect(w.subjects[id]).toMatchObject({
      status: "doing",
      due_on: "2026-10-20",
      checklist: [{ done: true }],
      completed_at: null,
    });
    expect(w.queue[0].doc.checklist?.[0].done).toBe(false);
    expect(w.queue[1].expectedRevision).toBe(1);
    setChecklistItem(w, user, id, itemId, true);
    expect(w.queue).toHaveLength(2);
    setChecklistItem(w, user, id, itemId, false);
    expect(w.queue[1].doc.checklist?.[0].done).toBe(true);
    completeSubject(w, user, id);
    expect(w.subjects[id].checklist?.[0].done).toBe(false);
  });
  it("preserves local checklist edits while acknowledging an older operation", () => {
    const w = workspace();
    const op = w.queue[0];
    const remote = structuredClone(w.subjects[id]);
    remote.revision = 1;
    setChecklistItem(w, user, id, itemId, true);
    acknowledge(w, op, remote, user);
    expect(w.subjects[id].checklist?.[0].done).toBe(true);
    expect(w.queue[0].expectedRevision).toBe(1);
  });
  it("retains exact legacy documents and validates old backups without checklist", () => {
    const w = workspace();
    delete w.subjects[id].checklist;
    delete w.queue[0].doc.checklist;
    const doc = documentOf(w.subjects[id]);
    expect(doc).not.toHaveProperty("checklist");
    expect(JSON.stringify(documentOf(doc))).toBe(JSON.stringify(doc));
    expect(
      parseBackup(
        JSON.stringify({
          format: "zenit-day",
          version: 1,
          userId: user,
          project: "test",
          workspace: w,
        }),
        user,
        "test",
      ).workspace.subjects[id].checklist,
    ).toBeUndefined();
  });
  it("rejects malformed, duplicate, blank and oversized items", () => {
    const doc = blankDoc("Teste");
    const item = { id: itemId, text: "Passo", done: false };
    for (const checklist of [
      null,
      {},
      [null],
      [{ ...item, done: "yes" }],
      [{ ...item, text: " \n " }],
      [{ ...item, text: "a".repeat(501) }],
      [{ ...item, id: "bad" }],
      [item, { ...item, id: itemId.toUpperCase() }],
      [{ ...item, extra: true }],
      Array(101).fill(item),
    ]) {
      expect(() => validateDoc({ ...doc, checklist } as never)).toThrow();
    }
    expect(() => validateDoc({ ...doc, checklist: [] })).not.toThrow();
  });
  it("blocks stale items and conflicts, and retains both checklists for recovery", () => {
    const w = workspace();
    const remote = structuredClone(w.subjects[id]);
    remote.revision = 2;
    remote.checklist![0].text = "Revisão no celular";
    w.conflicts[id] = { remote, detectedAt: "now" };
    expect(() => setChecklistItem(w, user, id, itemId, true)).toThrow(
      "duas versões",
    );
    resolveConflict(w, user, id, "remote");
    expect(w.subjects[id].checklist?.[0].text).toBe("Revisão no celular");
    expect(w.recovery[0].subject.checklist?.[0].text).toBe("Revisar proposta");
    expect(() => setChecklistItem(w, user, id, "missing", true)).toThrow(
      "mudou",
    );
    w.subjects[id].archived = true;
    expect(() => setChecklistItem(w, user, id, itemId, true)).toThrow(
      "Restaure",
    );
  });
});
describe("newest-first ordering", () => {
  it("ignores title, review date, updates and active goals, except Not today in Today", () => {
    const base = workspace().subjects[id];
    const older = {
      ...base,
      id: "a",
      created_at: "2026-09-28T10:00:00Z",
      updated_at: "2026-09-30T10:00:00Z",
      title: "A",
      review_on: "2026-01-01",
      daily_goal: "finish" as const,
      daily_goal_on: "2026-09-29",
    };
    const newer = {
      ...base,
      id: "b",
      created_at: "2026-09-29T10:00:00Z",
      title: "Z",
    };
    expect(
      [older, newer].sort((a, b) => compareSubjects(a, b, "2026-09-29")),
    ).toEqual([newer, older]);
    const deferred = {
      ...newer,
      daily_goal: "not_today" as const,
      daily_goal_on: "2026-09-29",
    };
    expect(
      [deferred, older].sort((a, b) => compareSubjects(a, b, "2026-09-29")),
    ).toEqual([older, deferred]);
    expect(compareSubjects(deferred, older)).toBeLessThan(0);
    expect(compareSubjects(deferred, older, "2026-09-30")).toBeLessThan(0);
  });
  it("orders equal creation times deterministically across devices", () => {
    const base = workspace().subjects[id];
    expect(
      compareSubjects({ ...base, id: "a" }, { ...base, id: "b" }),
    ).toBeLessThan(0);
  });
});
