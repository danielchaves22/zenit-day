import { describe, expect, it } from "vitest";
import {
  acknowledge,
  blankDoc,
  completeSubject,
  documentOf,
  emptyWorkspace,
  enqueue,
  undoCompletion,
  type Status,
} from "./model";

const user = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function workspace(status: Status = "waiting") {
  const w = emptyWorkspace();
  enqueue(w, user, id, {
    ...blankDoc("Retorno da Maria"),
    status,
    responsible_is_self: false,
    responsible_name: "Maria",
    next_action: "Conferir proposta",
    review_on: "2026-10-01",
    due_on: "2026-10-10",
    daily_goal: "finish",
    daily_goal_on: "2026-09-28",
  });
  return w;
}

describe("quick completion and undo", () => {
  it.each(["todo", "doing", "waiting", "blocked"] as const)(
    "restores %s and preserves all other subject fields",
    (status) => {
      const w = workspace(status);
      const before = documentOf(w.subjects[id]);
      const undo = completeSubject(w, user, id)!;
      expect(w.subjects[id].status).toBe("done");
      expect(w.subjects[id].completed_at).not.toBeNull();
      expect(w.queue.at(-1)?.note).toBe("Assunto concluído.");
      expect(completeSubject(w, user, id)).toBeNull();
      expect(w.queue).toHaveLength(2);
      undoCompletion(w, user, undo);
      expect(documentOf(w.subjects[id])).toEqual(before);
      expect(w.subjects[id].completed_at).toBeNull();
      expect(w.queue.map((op) => op.expectedRevision)).toEqual([0, 1, 2]);
    },
  );
  it("can undo after acknowledgements without dropping queued changes", () => {
    const w = workspace();
    const undo = completeSubject(w, user, id)!;
    for (const operation of [...w.queue]) {
      const remote = {
        ...w.subjects[id],
        ...operation.doc,
        revision: operation.expectedRevision + 1,
      };
      acknowledge(w, operation, remote, user);
    }
    expect(w.queue).toHaveLength(0);
    undoCompletion(w, user, undo);
    expect(w.queue[0].expectedRevision).toBe(2);
    expect(w.subjects[id].status).toBe("waiting");
  });
  it("rejects stale undo and protects newer edits and conflicts", () => {
    const w = workspace();
    const undo = completeSubject(w, user, id)!;
    enqueue(w, user, id, {
      ...documentOf(w.subjects[id]),
      situation: "Atualizado em outro momento",
    });
    const snapshot = structuredClone(w);
    expect(() => undoCompletion(w, user, undo)).toThrow("mudou após");
    expect(w).toEqual(snapshot);
    const conflicted = workspace();
    const conflictedUndo = completeSubject(conflicted, user, id)!;
    conflicted.conflicts[id] = { remote: null, detectedAt: "now" };
    expect(() => undoCompletion(conflicted, user, conflictedUndo)).toThrow(
      "duas versões",
    );
  });
  it("prevents completing archived or conflicted subjects", () => {
    const w = workspace();
    w.conflicts[id] = { remote: null, detectedAt: "now" };
    expect(() => completeSubject(w, user, id)).toThrow("duas versões");
    delete w.conflicts[id];
    w.subjects[id].archived = true;
    expect(() => completeSubject(w, user, id)).toThrow("em aberto");
  });
});
