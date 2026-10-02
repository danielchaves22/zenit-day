import type { Workspace } from "./model";

export interface ReminderSchedule {
  kind: "daily" | "weekly" | "monthly" | "interval";
  timeZone: string;
  startAt: string;
  endAt: string | null;
  times: string[];
  weekDays: number[];
  monthDay: number | null;
  intervalMinutes: number | null;
  windowStart: string | null;
  windowEnd: string | null;
}
export interface ReminderDoc {
  title: string;
  subject_id: string | null;
  enabled: boolean;
  deleted: boolean;
  schedule: ReminderSchedule;
}
export interface Reminder extends ReminderDoc {
  id: string;
  user_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface ReminderOperation {
  id: string;
  reminderId: string;
  expectedRevision: number;
  doc: ReminderDoc;
}
export interface RemindersState {
  rows: Record<string, Reminder>;
  queue: ReminderOperation[];
  conflicts: Record<string, Reminder | null>;
}
export const emptyReminders = (): RemindersState => ({
  rows: {},
  queue: [],
  conflicts: {},
});
export const remindersOf = (w: Workspace) => (w.reminders ??= emptyReminders());
export const weekDayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = /^([01]\d|2[0-3]):[0-5]\d$/;
export function blankReminder(): ReminderDoc {
  return {
    title: "",
    subject_id: null,
    enabled: true,
    deleted: false,
    schedule: {
      kind: "daily",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      startAt: new Date().toISOString(),
      endAt: null,
      times: ["08:00"],
      weekDays: [1],
      monthDay: 29,
      intervalMinutes: 120,
      windowStart: null,
      windowEnd: null,
    },
  };
}
export function reminderDocument(r: ReminderDoc): ReminderDoc {
  return structuredClone({
    title: r.title,
    subject_id: r.subject_id,
    enabled: r.enabled,
    deleted: r.deleted,
    schedule: r.schedule,
  });
}
export function validateReminder(doc: ReminderDoc) {
  const s = doc.schedule;
  if (
    typeof doc.title !== "string" ||
    !doc.title.trim() ||
    [...doc.title].length > 500 ||
    (doc.subject_id !== null &&
      (typeof doc.subject_id !== "string" || !uuid.test(doc.subject_id))) ||
    typeof doc.enabled !== "boolean" ||
    typeof doc.deleted !== "boolean" ||
    (doc.deleted && doc.enabled)
  )
    throw new Error("Confira o texto e o estado do lembrete.");
  if (
    !s ||
    !["daily", "weekly", "monthly", "interval"].includes(s.kind) ||
    typeof s.timeZone !== "string"
  )
    throw new Error("Escolha uma frequência válida.");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: s.timeZone }).format();
  } catch {
    throw new Error("Fuso horário inválido.");
  }
  if (
    typeof s.startAt !== "string" ||
    !Number.isFinite(Date.parse(s.startAt)) ||
    (s.endAt !== null &&
      (typeof s.endAt !== "string" ||
        !Number.isFinite(Date.parse(s.endAt)) ||
        Date.parse(s.endAt) <= Date.parse(s.startAt)))
  )
    throw new Error("O término precisa ser posterior ao início.");
  if (
    !Array.isArray(s.times) ||
    s.times.length > 24 ||
    s.times.some((t) => typeof t !== "string" || !time.test(t)) ||
    new Set(s.times).size !== s.times.length ||
    !Array.isArray(s.weekDays) ||
    s.weekDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(s.weekDays).size !== s.weekDays.length
  )
    throw new Error("Confira os horários e dias da semana, sem repetições.");
  if (s.kind !== "interval" && !s.times.length)
    throw new Error("Informe ao menos um horário.");
  if (s.kind === "weekly" && !s.weekDays.length)
    throw new Error("Escolha ao menos um dia da semana.");
  if (
    s.monthDay !== null &&
    (!Number.isInteger(s.monthDay) || s.monthDay < 1 || s.monthDay > 31)
  )
    throw new Error("O dia do mês deve estar entre 1 e 31.");
  if (s.kind === "monthly" && s.monthDay === null)
    throw new Error("Informe o dia do mês.");
  if (
    s.intervalMinutes !== null &&
    (!Number.isInteger(s.intervalMinutes) ||
      s.intervalMinutes < 1 ||
      s.intervalMinutes > 10080)
  )
    throw new Error("O intervalo deve ser de 1 minuto a 7 dias.");
  if (s.kind === "interval" && s.intervalMinutes === null)
    throw new Error("Informe o intervalo.");
  if (
    (s.windowStart === null) !== (s.windowEnd === null) ||
    (s.windowStart !== null &&
      (!time.test(s.windowStart) ||
        !time.test(s.windowEnd!) ||
        s.windowStart >= s.windowEnd!))
  )
    throw new Error(
      "A faixa diária precisa ter início e fim válidos no mesmo dia.",
    );
}
export function validateReminderRow(r: Reminder, userId: string) {
  if (
    !r ||
    r.user_id !== userId ||
    !uuid.test(r.id) ||
    !Number.isInteger(r.revision) ||
    r.revision < 1 ||
    !Number.isFinite(Date.parse(r.created_at)) ||
    !Number.isFinite(Date.parse(r.updated_at))
  )
    throw new Error("Lembrete recebido inválido.");
  validateReminder(r);
}
export function enqueueReminder(
  w: Workspace,
  userId: string,
  id: string,
  doc: ReminderDoc,
) {
  validateReminder(doc);
  if (!uuid.test(id)) throw new Error("Identificação inválida.");
  const state = remindersOf(w),
    old = state.rows[id];
  if (Object.hasOwn(state.conflicts, id))
    throw new Error("Compare as versões deste lembrete antes de alterá-lo.");
  if (old && old.user_id !== userId) throw new Error("Conta diferente.");
  const previous = state.queue.filter((op) => op.reminderId === id).at(-1);
  const expectedRevision = previous
    ? previous.expectedRevision + 1
    : (old?.revision ?? 0);
  state.queue.push({
    id: crypto.randomUUID(),
    reminderId: id,
    expectedRevision,
    doc: reminderDocument(doc),
  });
  const now = new Date().toISOString();
  state.rows[id] = {
    ...reminderDocument(doc),
    id,
    user_id: userId,
    revision: old?.revision ?? 0,
    created_at: old?.created_at ?? now,
    updated_at: now,
  };
}
export function acknowledgeReminder(
  w: Workspace,
  op: ReminderOperation,
  row: Reminder,
  userId: string,
) {
  validateReminderRow(row, userId);
  if (row.id !== op.reminderId || row.revision !== op.expectedRevision + 1)
    throw new Error("Confirmação de lembrete inválida.");
  const s = remindersOf(w);
  s.queue = s.queue.filter((item) => item.id !== op.id);
  if (!s.queue.some((item) => item.reminderId === row.id)) s.rows[row.id] = row;
  else s.rows[row.id].revision = row.revision;
}
export function mergeReminders(w: Workspace, rows: Reminder[], userId: string) {
  rows.forEach((r) => validateReminderRow(r, userId));
  const s = remindersOf(w);
  for (const r of rows)
    if (
      !s.queue.some((op) => op.reminderId === r.id) &&
      !Object.hasOwn(s.conflicts, r.id)
    )
      s.rows[r.id] = r;
}
export function resolveReminderConflict(
  w: Workspace,
  userId: string,
  id: string,
  choice: "local" | "remote",
) {
  const s = remindersOf(w);
  if (!Object.hasOwn(s.conflicts, id)) return;
  const local = s.rows[id],
    remote = s.conflicts[id];
  s.queue = s.queue.filter((op) => op.reminderId !== id);
  delete s.conflicts[id];
  if (remote) s.rows[id] = remote;
  else delete s.rows[id];
  if (choice === "local")
    enqueueReminder(w, userId, id, reminderDocument(local));
}
export function scheduleLabel(s: ReminderSchedule) {
  const hours = s.times.join(", ");
  const base =
    s.kind === "daily"
      ? `Todos os dias às ${hours}`
      : s.kind === "weekly"
        ? `${s.weekDays.map((d) => weekDayLabels[d]).join(", ")} às ${hours}`
        : s.kind === "monthly"
          ? `Dia ${s.monthDay} às ${hours} (último dia se o mês for menor)`
          : `A cada ${s.intervalMinutes! % 60 === 0 ? `${s.intervalMinutes! / 60} h` : `${s.intervalMinutes} min`}${s.windowStart ? `, das ${s.windowStart} às ${s.windowEnd}` : ", a partir do início"}`;
  return `${base} · ${s.timeZone}`;
}
export function localDateTime(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function fromLocalDateTime(value: string, zone: string) {
  const target = Date.parse(value + ":00Z");
  if (!Number.isFinite(target))
    throw new Error("Informe uma data e horário válidos.");
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const actual = Date.parse(
      localDateTime(new Date(candidate).toISOString(), zone) + ":00Z",
    );
    candidate += target - actual;
  }
  if (localDateTime(new Date(candidate).toISOString(), zone) !== value)
    throw new Error(
      "Este horário não existe nesse fuso. Escolha outro horário.",
    );
  return new Date(candidate).toISOString();
}
