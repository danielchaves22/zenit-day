import { describe, expect, it } from "vitest";
import {
  blankDoc,
  dailyFocusOrder,
  dailyGoalFor,
  documentOf,
  emptyWorkspace,
  enqueue,
  isToday,
  setDailyGoal,
  validateDoc,
} from "./model";
const user = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const day = "2026-09-28";
function workspace() {
  const w = emptyWorkspace();
  enqueue(w, user, id, {
    ...blankDoc("Revisar proposta"),
    status: "doing",
    next_action: "Conferir o valor",
    review_on: "2026-10-15",
    due_on: "2026-10-20",
  });
  return w;
}
describe("daily intentions", () => {
  it("brings an undated-for-today subject into Today without completing or rescheduling it", () => {
    const w = workspace();
    expect(isToday(w.subjects[id], day)).toBe(false);
    setDailyGoal(w, user, id, "finish", day);
    expect(isToday(w.subjects[id], day)).toBe(true);
    expect(w.subjects[id]).toMatchObject({
      status: "doing",
      next_action: "Conferir o valor",
      review_on: "2026-10-15",
      due_on: "2026-10-20",
      completed_at: null,
    });
    expect(w.queue.at(-1)?.doc.daily_goal).toBe("finish");
  });
  it("expires the daily intention by date, preserves it for history and never hides a due deadline", () => {
    const w = workspace();
    setDailyGoal(w, user, id, "not_today", day);
    const s = w.subjects[id];
    expect(dailyFocusOrder(s, day)).toBe(2);
    expect(isToday(s, day)).toBe(true);
    expect(dailyGoalFor(s, "2026-09-29")).toBeNull();
    expect(isToday(s, "2026-09-29")).toBe(false);
    expect(s.daily_goal).toBe("not_today");
    s.due_on = day;
    expect(isToday(s, day)).toBe(true);
    expect(isToday(s, "2026-09-29")).toBe(true);
    expect(dailyFocusOrder(s, "2026-09-29")).toBe(1);
  });
  it("supports clearing, following up other people, and repeat choices without duplicate operations", () => {
    const w = workspace();
    w.subjects[id].responsible_is_self = false;
    w.subjects[id].responsible_name = "Maria";
    setDailyGoal(w, user, id, "follow_up", day);
    const count = w.queue.length;
    setDailyGoal(w, user, id, "follow_up", day);
    expect(w.queue).toHaveLength(count);
    setDailyGoal(w, user, id, null, day);
    expect(w.subjects[id]).toMatchObject({
      daily_goal: null,
      daily_goal_on: null,
      responsible_name: "Maria",
    });
  });
  it("keeps pre-upgrade request payloads unchanged for idempotent retries", () => {
    const legacy = blankDoc("Legacy");
    delete legacy.daily_goal;
    delete legacy.daily_goal_on;
    const before = JSON.stringify(legacy);
    validateDoc(legacy);
    expect(JSON.stringify(documentOf(legacy))).toBe(before);
  });
  it("validates date/goal pairs and prevents edits to closed or conflicted subjects", () => {
    const doc = blankDoc();
    doc.title = "Subject";
    expect(() => validateDoc({ ...doc, daily_goal: "finish" })).toThrow();
    expect(() =>
      validateDoc({
        ...doc,
        daily_goal: "finish",
        daily_goal_on: "2026-02-30",
      }),
    ).toThrow();
    const w = workspace();
    w.conflicts[id] = { remote: null, detectedAt: "now" };
    expect(() => setDailyGoal(w, user, id, "start", day)).toThrow(
      "duas versões",
    );
    delete w.conflicts[id];
    w.subjects[id].status = "done";
    expect(() => setDailyGoal(w, user, id, "start", day)).toThrow("em aberto");
  });
});
