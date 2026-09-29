export const statuses = {
  todo: "A fazer",
  doing: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  done: "Concluído",
} as const;
export type Status = keyof typeof statuses;
export const dailyGoals = {
  start: "Iniciar",
  advance: "Avançar",
  finish: "Finalizar",
  follow_up: "Acompanhar",
  not_today: "Não hoje",
} as const;
export type DailyGoal = keyof typeof dailyGoals;
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export const checklistLimit = 100;
export const checklistTextLimit = 500;
export interface SubjectDoc {
  title: string;
  responsible_is_self: boolean;
  responsible_name: string | null;
  project: string | null;
  // project is the group name, retained for compatibility with existing clients.
  subgroup?: string | null;
  status: Status;
  situation: string;
  next_action: string;
  review_on: string | null;
  due_on: string | null;
  archived: boolean;
  // Optional for pre-0.1.1 documents and queued requests: preserve their exact payload.
  daily_goal?: DailyGoal | null;
  daily_goal_on?: string | null;
  // Absence must survive legacy queue retries; [] explicitly clears the list.
  checklist?: ChecklistItem[];
}
export interface Subject extends SubjectDoc {
  id: string;
  user_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
export interface Update {
  id: string;
  user_id: string;
  subject_id: string;
  subject_revision: number;
  kind: string;
  note: string | null;
  created_at: string;
}
export interface Operation {
  id: string;
  subjectId: string;
  expectedRevision: number;
  doc: SubjectDoc;
  note: string | null;
  createdAt: string;
}
export interface Conflict {
  remote: Subject | null;
  detectedAt: string;
}
export interface Recovery {
  subject: Subject;
  operations: Operation[];
  savedAt: string;
}
export interface Workspace {
  schema: 1;
  subjects: Record<string, Subject>;
  queue: Operation[];
  history: Update[];
  conflicts: Record<string, Conflict>;
  recovery: Recovery[];
  lastSync: string | null;
}
export const emptyWorkspace = (): Workspace => ({
  schema: 1,
  subjects: {},
  queue: [],
  history: [],
  conflicts: {},
  recovery: [],
  lastSync: null,
});
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayLabel(date: string | null) {
  return date
    ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : "Sem data";
}
export function blankDoc(title = ""): SubjectDoc {
  return {
    title,
    responsible_is_self: true,
    responsible_name: null,
    project: null,
    status: "todo",
    situation: "",
    next_action: "",
    review_on: today(),
    due_on: null,
    archived: false,
    daily_goal: null,
    daily_goal_on: null,
    checklist: [],
    subgroup: null,
  };
}
export function documentOf(s: SubjectDoc): SubjectDoc {
  return {
    title: s.title,
    responsible_is_self: s.responsible_is_self,
    responsible_name: s.responsible_name,
    project: s.project,
    status: s.status,
    situation: s.situation,
    next_action: s.next_action,
    review_on: s.review_on,
    due_on: s.due_on,
    archived: s.archived,
    ...(s.daily_goal === undefined && s.daily_goal_on === undefined
      ? {}
      : {
          daily_goal: s.daily_goal ?? null,
          daily_goal_on: s.daily_goal_on ?? null,
        }),
    ...(s.checklist === undefined
      ? {}
      : { checklist: s.checklist.map((item) => ({ ...item })) }),
    ...(s.subgroup === undefined ? {} : { subgroup: s.subgroup }),
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function validateDoc(doc: SubjectDoc) {
  if (
    doc.subgroup !== undefined &&
    doc.subgroup !== null &&
    (typeof doc.subgroup !== "string" ||
      !doc.subgroup.trim() ||
      [...doc.subgroup].length > 200 ||
      !doc.project?.trim())
  )
    throw new Error(
      "Um subgrupo precisa de um grupo e de um nome de até 200 caracteres.",
    );
  if (doc.checklist !== undefined) {
    const ids = new Set<string>();
    if (!Array.isArray(doc.checklist) || doc.checklist.length > checklistLimit)
      throw new Error(`O checklist deve ter até ${checklistLimit} itens.`);
    for (const item of doc.checklist) {
      if (
        !item ||
        typeof item !== "object" ||
        Object.keys(item).some(
          (key) => !["id", "text", "done"].includes(key),
        ) ||
        typeof item.id !== "string" ||
        !uuid.test(item.id) ||
        ids.has(item.id.toLowerCase()) ||
        typeof item.done !== "boolean" ||
        typeof item.text !== "string" ||
        !item.text.trim() ||
        [...item.text].length > checklistTextLimit
      )
        throw new Error(
          `Cada item precisa de um texto de até ${checklistTextLimit} caracteres e uma identificação única.`,
        );
      ids.add(item.id.toLowerCase());
    }
  }
  if (
    typeof doc.title !== "string" ||
    !doc.title.trim() ||
    [...doc.title].length > 200
  )
    throw new Error("Informe um título de até 200 caracteres.");
  if (
    !Object.hasOwn(statuses, doc.status) ||
    typeof doc.archived !== "boolean" ||
    typeof doc.responsible_is_self !== "boolean"
  )
    throw new Error("Assunto com campos inválidos.");
  if (!doc.responsible_is_self && !doc.responsible_name?.trim())
    throw new Error("Informe quem é responsável.");
  for (const [name, limit] of [
    ["responsible_name", 200],
    ["project", 200],
    ["situation", 8000],
    ["next_action", 2000],
  ] as const) {
    const value = doc[name];
    if (
      (value !== null && typeof value !== "string") ||
      (typeof value === "string" && [...value].length > limit) ||
      (value === null && (name === "situation" || name === "next_action"))
    )
      throw new Error(
        "Um dos campos ultrapassa o tamanho permitido ou é inválido.",
      );
  }
  if (!validDate(doc.review_on) || !validDate(doc.due_on))
    throw new Error("Informe datas válidas.");
  const goal = doc.daily_goal ?? null;
  const goalDate = doc.daily_goal_on ?? null;
  if (
    (goal !== null && !Object.hasOwn(dailyGoals, goal)) ||
    (goal === null) !== (goalDate === null) ||
    !validDate(goalDate)
  )
    throw new Error("A meta precisa de uma opção e uma data válidas.");
}
export function validateSubject(s: Subject, userId: string) {
  validateDoc(s);
  if (
    !uuid.test(s.id) ||
    s.user_id !== userId ||
    !Number.isInteger(s.revision) ||
    s.revision < 0
  )
    throw new Error(
      "O registro recebido não pertence a esta conta ou é inválido.",
    );
}
export function enqueue(
  w: Workspace,
  userId: string,
  id: string,
  doc: SubjectDoc,
  note: string | null = null,
) {
  validateDoc(doc);
  if (w.conflicts[id])
    throw new Error(
      "Resolva as duas versões deste assunto antes de alterá-lo.",
    );
  if (note && [...note].length > 8000)
    throw new Error("O andamento deve ter até 8.000 caracteres.");
  const old = w.subjects[id];
  const now = new Date().toISOString();
  const pending = w.queue.filter((op) => op.subjectId === id);
  const expectedRevision = (old?.revision ?? 0) + pending.length;
  w.queue.push({
    id: crypto.randomUUID(),
    subjectId: id,
    expectedRevision,
    doc: documentOf(doc),
    note: note?.trim() || null,
    createdAt: now,
  });
  w.subjects[id] = {
    ...doc,
    id,
    user_id: userId,
    revision: old?.revision ?? 0,
    created_at: old?.created_at ?? now,
    updated_at: now,
    completed_at: doc.status === "done" ? (old?.completed_at ?? now) : null,
  };
}
export function acknowledge(
  w: Workspace,
  operation: Operation,
  remote: Subject,
  userId: string,
) {
  validateSubject(remote, userId);
  if (
    remote.id !== operation.subjectId ||
    remote.revision !== operation.expectedRevision + 1
  )
    throw new Error("Confirmação de gravação inesperada.");
  w.queue = w.queue.filter((op) => op.id !== operation.id);
  const later = w.queue.filter((op) => op.subjectId === remote.id);
  w.subjects[remote.id] = later.length
    ? {
        ...remote,
        ...documentOf(w.subjects[remote.id]),
        updated_at: w.subjects[remote.id].updated_at,
        completed_at: w.subjects[remote.id].completed_at,
      }
    : remote;
}
export function mergeRemote(
  w: Workspace,
  subjects: Subject[],
  history: Update[],
  userId: string,
) {
  for (const s of subjects) {
    validateSubject(s, userId);
    const local = w.subjects[s.id];
    if (
      !w.queue.some((op) => op.subjectId === s.id) &&
      !w.conflicts[s.id] &&
      (!local || s.revision >= local.revision)
    )
      w.subjects[s.id] = s;
  }
  if (history.some((h) => h.user_id !== userId || !uuid.test(h.id)))
    throw new Error("Histórico incompatível com esta conta.");
  w.history = history;
  w.lastSync = new Date().toISOString();
}
export function resolveConflict(
  w: Workspace,
  userId: string,
  id: string,
  choice: "local" | "remote",
) {
  const conflict = w.conflicts[id];
  const local = w.subjects[id];
  if (!conflict || !local) throw new Error("Este assunto já foi conciliado.");
  w.recovery.push({
    subject: structuredClone(local),
    operations: w.queue.filter((op) => op.subjectId === id),
    savedAt: new Date().toISOString(),
  });
  w.queue = w.queue.filter((op) => op.subjectId !== id);
  delete w.conflicts[id];
  if (conflict.remote) w.subjects[id] = conflict.remote;
  else delete w.subjects[id];
  if (choice === "local")
    enqueue(
      w,
      userId,
      id,
      documentOf(local),
      "Versão local escolhida após comparação entre dispositivos.",
    );
}
export function dailyGoalFor(s: SubjectDoc, date = today()): DailyGoal | null {
  return s.daily_goal_on === date ? (s.daily_goal ?? null) : null;
}
export interface CompletionUndo {
  subjectId: string;
  previousStatus: Exclude<Status, "done">;
  revision: number;
}
function localRevision(w: Workspace, subject: Subject) {
  return (
    subject.revision +
    w.queue.filter((op) => op.subjectId === subject.id).length
  );
}
export function completeSubject(
  w: Workspace,
  userId: string,
  id: string,
): CompletionUndo | null {
  const subject = w.subjects[id];
  if (!subject || subject.archived)
    throw new Error(
      "A conclusão rápida está disponível nos assuntos em aberto.",
    );
  if (subject.status === "done") return null;
  const undo: CompletionUndo = {
    subjectId: id,
    previousStatus: subject.status,
    revision: localRevision(w, subject) + 1,
  };
  enqueue(
    w,
    userId,
    id,
    { ...documentOf(subject), status: "done" },
    "Assunto concluído.",
  );
  return undo;
}
export function undoCompletion(
  w: Workspace,
  userId: string,
  undo: CompletionUndo,
) {
  const subject = w.subjects[undo.subjectId];
  if (
    !subject ||
    subject.archived ||
    subject.status !== "done" ||
    localRevision(w, subject) !== undo.revision
  )
    throw new Error(
      "Este assunto mudou após a conclusão. Abra os detalhes para conferir o status atual.",
    );
  enqueue(
    w,
    userId,
    subject.id,
    { ...documentOf(subject), status: undo.previousStatus },
    `Conclusão desfeita. Status anterior: ${statuses[undo.previousStatus]}.`,
  );
}
export function dailyFocusOrder(s: SubjectDoc, date = today()) {
  const goal = dailyGoalFor(s, date);
  return goal === "not_today" ? 2 : 1;
}
export function compareSubjects(a: Subject, b: Subject, focusDate?: string) {
  return (
    (focusDate
      ? dailyFocusOrder(a, focusDate) - dailyFocusOrder(b, focusDate)
      : 0) ||
    new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf() ||
    a.id.localeCompare(b.id)
  );
}
export function setChecklistItem(
  w: Workspace,
  userId: string,
  id: string,
  itemId: string,
  done: boolean,
) {
  const subject = w.subjects[id];
  if (!subject || subject.archived)
    throw new Error("Restaure o assunto antes de alterar o checklist.");
  const item = subject.checklist?.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Este item mudou. Confira o checklist atual.");
  if (item.done === done) return;
  enqueue(
    w,
    userId,
    id,
    {
      ...documentOf(subject),
      checklist: subject.checklist!.map((entry) =>
        entry.id === itemId ? { ...entry, done } : { ...entry },
      ),
    },
    `Checklist: ${done ? "concluído" : "reaberto"} — ${item.text}`,
  );
}
export function setDailyGoal(
  w: Workspace,
  userId: string,
  id: string,
  goal: DailyGoal | null,
  date = today(),
) {
  const subject = w.subjects[id];
  if (!subject || subject.archived || subject.status === "done")
    throw new Error("A meta é definida nos assuntos em aberto.");
  if (dailyGoalFor(subject, date) === goal) return;
  enqueue(
    w,
    userId,
    id,
    {
      ...documentOf(subject),
      daily_goal: goal,
      daily_goal_on: goal ? date : null,
    },
    goal
      ? `Meta de ${dayLabel(date)}: ${dailyGoals[goal]}.`
      : `Meta de ${dayLabel(date)} removida.`,
  );
}
export function isToday(s: SubjectDoc, date = today()) {
  return (
    !s.archived &&
    s.status !== "done" &&
    ((s.review_on !== null && s.review_on <= date) ||
      (s.due_on !== null && s.due_on <= date) ||
      dailyGoalFor(s, date) !== null)
  );
}
export interface Backup {
  format: "zenit-day";
  version: 1;
  exportedAt: string;
  userId: string;
  project: string;
  workspace: Workspace;
}
export function parseBackup(
  text: string,
  userId: string,
  project: string,
): Backup {
  if (text.length > 20_000_000) throw new Error("O arquivo excede 20 MB.");
  const b = JSON.parse(text) as Backup;
  if (
    b.format !== "zenit-day" ||
    b.version !== 1 ||
    b.userId !== userId ||
    b.project !== project ||
    b.workspace?.schema !== 1 ||
    !Array.isArray(b.workspace.queue) ||
    !Array.isArray(b.workspace.recovery)
  )
    throw new Error(
      "A cópia deve ser do Zenit Day, desta conta e deste projeto.",
    );
  for (const [id, s] of Object.entries(b.workspace.subjects)) {
    validateSubject(s, userId);
    if (id !== s.id) throw new Error("Identificação inválida na cópia.");
  }
  return b;
}
