import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Bell, Pause, Play, Plus, Pencil, Trash2 } from "lucide-react";
import type { Repository } from "./storage";
import {
  blankReminder,
  emptyReminders,
  enqueueReminder,
  fromLocalDateTime,
  localDateTime,
  reminderDocument,
  resolveReminderConflict,
  scheduleLabel,
  validateReminder,
  weekDayLabels,
  type ReminderDoc,
  type ReminderSchedule,
} from "./reminders";
import "./reminders.css";

export function RemindersPanel({
  repo,
  userId,
  synchronize,
}: {
  repo: Repository;
  userId: string;
  synchronize: () => Promise<void>;
}) {
  const w = useSyncExternalStore(repo.subscribe, repo.snapshot),
    state = w.reminders ?? emptyReminders();
  const [editing, setEditing] = useState<{
    id: string;
    doc: ReminderDoc;
  } | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const rows = Object.values(state.rows).filter(
    (r) => !r.deleted || Object.hasOwn(state.conflicts, r.id),
  );
  async function change(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      setEditing(null);
      setDeleting(null);
      if (navigator.onLine) void synchronize();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const save = (id: string, doc: ReminderDoc) =>
    change(() => repo.mutate((w) => enqueueReminder(w, userId, id, doc)));
  const status = (enabled: boolean, deleted: boolean) =>
    deleted ? "Excluído" : enabled ? "Ativo" : "Pausado";
  return (
    <div className="reminders-panel">
      <p className="muted">
        Lembretes independentes ou ligados a um assunto. Alterações offline
        passam a valer após a sincronização. O envio pelo WhatsApp será
        habilitado separadamente pelo Hub.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing ? (
        <ReminderForm
          key={editing.id}
          initial={editing.doc}
          subjects={Object.values(w.subjects).filter((s) => !s.archived)}
          busy={busy}
          cancel={() => {
            if (!busy) setEditing(null);
          }}
          save={(doc) => save(editing.id, doc)}
        />
      ) : (
        <>
          <div className="reminder-toolbar">
            <button
              className="button primary"
              onClick={() =>
                setEditing({ id: crypto.randomUUID(), doc: blankReminder() })
              }
            >
              <Plus size={17} />
              Novo lembrete
            </button>
            <span className="muted">
              {state.queue.length
                ? `${state.queue.length} alteração(ões) aguardando sincronização`
                : `${rows.length} lembrete(s)`}
            </span>
          </div>
          {!rows.length && (
            <div className="reminder-empty">
              <Bell size={26} />
              <p>O que você quer lembrar?</p>
              <small>
                Horários diários, dias da semana, dia do mês ou intervalos.
              </small>
            </div>
          )}
          {rows
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((r) => (
              <article key={r.id} className="reminder-row">
                <div className="reminder-title">
                  <strong>{r.title}</strong>
                  <span className="reminder-state">
                    {status(r.enabled, r.deleted)}
                  </span>
                </div>
                <p>{scheduleLabel(r.schedule)}</p>
                <small className="muted">
                  Início:{" "}
                  {localDateTime(
                    r.schedule.startAt,
                    r.schedule.timeZone,
                  ).replace("T", " ")}
                  {r.schedule.endAt &&
                    ` · Até: ${localDateTime(r.schedule.endAt, r.schedule.timeZone).replace("T", " ")} (fim exclusivo)`}
                </small>
                {r.subject_id && (
                  <small className="muted">
                    Assunto:{" "}
                    {w.subjects[r.subject_id]?.title ?? "Assunto vinculado"}
                  </small>
                )}
                {Object.hasOwn(state.conflicts, r.id) ? (
                  <div className="warning">
                    <strong>Este lembrete mudou em outro dispositivo.</strong>
                    <p>A versão deste dispositivo aparece acima.</p>
                    {state.conflicts[r.id] ? (
                      <p>
                        Na nuvem: {state.conflicts[r.id]!.title} ·{" "}
                        {scheduleLabel(state.conflicts[r.id]!.schedule)} ·{" "}
                        {status(
                          state.conflicts[r.id]!.enabled,
                          state.conflicts[r.id]!.deleted,
                        )}
                      </p>
                    ) : (
                      <p>O lembrete não existe na nuvem.</p>
                    )}
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void change(() =>
                            repo.mutate((w) =>
                              resolveReminderConflict(
                                w,
                                userId,
                                r.id,
                                "remote",
                              ),
                            ),
                          )
                        }
                      >
                        Usar versão da nuvem
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void change(() =>
                            repo.mutate((w) =>
                              resolveReminderConflict(w, userId, r.id, "local"),
                            ),
                          )
                        }
                      >
                        Manter minha versão
                      </button>
                    </div>
                  </div>
                ) : deleting === r.id ? (
                  <div className="warning">
                    <p>Excluir este lembrete e suas próximas ocorrências?</p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        Voltar
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void save(r.id, {
                            ...reminderDocument(r),
                            enabled: false,
                            deleted: true,
                          })
                        }
                      >
                        Excluir lembrete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="button-row">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        setEditing({ id: r.id, doc: reminderDocument(r) })
                      }
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void save(r.id, {
                          ...reminderDocument(r),
                          enabled: !r.enabled,
                        })
                      }
                    >
                      {r.enabled ? <Pause size={15} /> : <Play size={15} />}
                      {r.enabled ? "Pausar" : "Retomar"}
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setDeleting(r.id)}
                    >
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>
                )}
              </article>
            ))}
        </>
      )}
    </div>
  );
}
function ReminderForm({
  initial,
  subjects,
  busy,
  save,
  cancel,
}: {
  initial: ReminderDoc;
  subjects: { id: string; title: string }[];
  busy: boolean;
  save: (doc: ReminderDoc) => Promise<void>;
  cancel: () => void;
}) {
  const [doc, setDoc] = useState(() => structuredClone(initial)),
    [error, setError] = useState("");
  const s = doc.schedule;
  function schedule(patch: Partial<ReminderSchedule>) {
    setDoc((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));
  }
  function date(field: "startAt" | "endAt", value: string) {
    try {
      schedule({
        [field]: value
          ? fromLocalDateTime(value, s.timeZone)
          : field === "endAt"
            ? null
            : s.startAt,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      validateReminder(doc);
      setError("");
      await save(doc);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form className="reminder-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>
          O que lembrar?
          <textarea
            value={doc.title}
            required
            maxLength={500}
            autoFocus
            onChange={(e) => setDoc({ ...doc, title: e.target.value })}
          />
        </label>
        <label>
          Assunto vinculado
          <select
            value={doc.subject_id ?? ""}
            onChange={(e) =>
              setDoc({ ...doc, subject_id: e.target.value || null })
            }
          >
            <option value="">Lembrete independente</option>
            {doc.subject_id &&
              !subjects.some((v) => v.id === doc.subject_id) && (
                <option value={doc.subject_id}>Assunto arquivado</option>
              )}
            {subjects.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Repetir
          <select
            value={s.kind}
            onChange={(e) =>
              schedule({ kind: e.target.value as ReminderSchedule["kind"] })
            }
          >
            <option value="daily">Todos os dias</option>
            <option value="weekly">Dias da semana</option>
            <option value="monthly">Dia do mês</option>
            <option value="interval">Em intervalos</option>
          </select>
        </label>
        {s.kind === "weekly" && (
          <fieldset className="reminder-week">
            <legend>Dias da semana</legend>
            {weekDayLabels.map((label, day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={s.weekDays.includes(day)}
                  onChange={(e) =>
                    schedule({
                      weekDays: e.target.checked
                        ? [...s.weekDays, day].sort()
                        : s.weekDays.filter((d) => d !== day),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        {s.kind === "monthly" && (
          <>
            <label>
              Dia do mês
              <input
                type="number"
                min={1}
                max={31}
                required
                value={s.monthDay ?? 29}
                onChange={(e) => schedule({ monthDay: Number(e.target.value) })}
              />
            </label>
            <p className="muted">
              Quando o mês não tiver esse dia, será usado o último dia do mês.
            </p>
          </>
        )}
        {s.kind !== "interval" ? (
          <fieldset className="reminder-times">
            <legend>Horários</legend>
            {s.times.map((value, index) => (
              <div key={index}>
                <input
                  aria-label={`Horário ${index + 1}`}
                  type="time"
                  required
                  value={value}
                  onChange={(e) =>
                    schedule({
                      times: s.times.map((t, i) =>
                        i === index ? e.target.value : t,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="button"
                  disabled={s.times.length === 1}
                  aria-label={`Remover horário ${index + 1}`}
                  onClick={() =>
                    schedule({ times: s.times.filter((_, i) => i !== index) })
                  }
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button"
              disabled={s.times.length >= 24}
              onClick={() => schedule({ times: [...s.times, ""] })}
            >
              Adicionar horário
            </button>
          </fieldset>
        ) : (
          <>
            <label>
              Minutos entre avisos
              <input
                type="number"
                min={1}
                max={10080}
                required
                value={s.intervalMinutes ?? 120}
                onChange={(e) =>
                  schedule({ intervalMinutes: Number(e.target.value) })
                }
              />
            </label>
            <small className="muted">
              120 minutos = 2 horas · 720 minutos = 12 horas. Sem faixa diária,
              o intervalo continua durante a noite.
            </small>
            <label className="reminder-checkbox">
              <input
                type="checkbox"
                checked={s.windowStart !== null}
                onChange={(e) =>
                  schedule({
                    windowStart: e.target.checked ? "08:00" : null,
                    windowEnd: e.target.checked ? "18:00" : null,
                  })
                }
              />
              Limitar a uma faixa diária
            </label>
            {s.windowStart !== null && (
              <div className="reminder-columns">
                <label>
                  Das
                  <input
                    type="time"
                    required
                    value={s.windowStart}
                    onChange={(e) => schedule({ windowStart: e.target.value })}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="time"
                    required
                    value={s.windowEnd!}
                    onChange={(e) => schedule({ windowEnd: e.target.value })}
                  />
                </label>
              </div>
            )}
          </>
        )}
        <div className="reminder-columns">
          <label>
            Começar em
            <input
              type="datetime-local"
              required
              value={localDateTime(s.startAt, s.timeZone)}
              onChange={(e) => date("startAt", e.target.value)}
            />
          </label>
          <label>
            Terminar em (opcional)
            <input
              type="datetime-local"
              value={s.endAt ? localDateTime(s.endAt, s.timeZone) : ""}
              onChange={(e) => date("endAt", e.target.value)}
            />
          </label>
        </div>
        <p className="muted">
          Fuso: {s.timeZone}. O horário de término não gera aviso. Para
          intervalos contínuos, os próximos horários permanecem ligados ao
          início definido.
        </p>
        <label className="reminder-checkbox">
          <input
            type="checkbox"
            checked={doc.enabled}
            onChange={(e) => setDoc({ ...doc, enabled: e.target.checked })}
          />
          Lembrete ativo
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button" onClick={cancel}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            {busy ? "Salvando…" : "Salvar lembrete"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
