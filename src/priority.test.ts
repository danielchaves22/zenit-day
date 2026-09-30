import { describe, it, expect } from "vitest";
import {
  acknowledge,
  blankDoc,
  compareSubjects,
  completeSubject,
  documentOf,
  emptyWorkspace,
  enqueue,
  parseBackup,
  priorityOf,
  resolveConflict,
  validateDoc,
  type SubjectDoc,
} from "./model";
const user = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("priority persistence", () => {
  it("preserves exact legacy documents and pending operations in backups", () => {
    const w = emptyWorkspace();
    const doc = blankDoc("Legacy");
    delete doc.priority;
    enqueue(w, user, id, doc);
    expect(priorityOf(w.subjects[id])).toBe("normal");
    expect(documentOf(doc)).not.toHaveProperty("priority");
    const backup = {
      version: 1,
      format: "zenit-day",
      userId: user,
      project: "test",
      workspace: w,
    };
    const restored = parseBackup(JSON.stringify(backup), user, "test");
    expect(restored.workspace.queue[0].doc).toEqual(doc);
    expect(restored.workspace.subjects[id]).not.toHaveProperty("priority");
  });
  it("preserves newer priority edits when acknowledging an earlier save, completing and resolving conflicts", () => {
    const w = emptyWorkspace();
    enqueue(w, user, id, blankDoc("Retorno", "important"));
    const op = w.queue[0];
    const remote = { ...w.subjects[id], revision: 1 };
    enqueue(w, user, id, { ...documentOf(w.subjects[id]), priority: "urgent" });
    acknowledge(w, op, remote, user);
    expect(w.subjects[id].priority).toBe("urgent");
    completeSubject(w, user, id);
    expect(w.subjects[id].priority).toBe("urgent");
    w.conflicts[id] = {
      remote: { ...remote, priority: "low" },
      detectedAt: "now",
    };
    resolveConflict(w, user, id, "remote");
    expect(w.subjects[id].priority).toBe("low");
    expect(w.recovery[0].subject.priority).toBe("urgent");
  });
  it("rejects corrupt priorities and keeps newest-first ordering", () => {
    for (const priority of [null, 1, {}, ["urgent"], "high", ""])
      expect(() =>
        validateDoc({ ...blankDoc("x"), priority } as SubjectDoc),
      ).toThrow("prioridade");
    const w = emptyWorkspace();
    enqueue(w, user, id, blankDoc("x"));
    const s = w.subjects[id];
    const older = {
      ...s,
      created_at: "2026-09-28T10:00:00Z",
      priority: "urgent" as const,
    };
    const newer = {
      ...s,
      created_at: "2026-09-29T10:00:00Z",
      priority: "low" as const,
    };
    expect([older, newer].sort(compareSubjects)).toEqual([newer, older]);
  });
});
