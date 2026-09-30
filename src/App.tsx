import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  CheckCheck,
  ListChecks,
  Trash2,
  ChevronRight,
  Circle,
  CloudCheck,
  CloudOff,
  Download,
  Folder,
  History,
  LogOut,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sunrise,
  Target,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Api, config, LoginRequired, type Session } from "./api";
import { Repository, exportFile, importFile, native } from "./storage";
import { Synchronizer } from "./sync";
import {
  blankDoc,
  checklistLimit,
  checklistTextLimit,
  compareSubjects,
  completeSubject,
  dailyGoals,
  dailyGoalFor,
  dayLabel,
  documentOf,
  enqueue,
  isToday,
  parseBackup,
  priorities,
  priorityOf,
  resolveConflict,
  setDailyGoal,
  setChecklistItem,
  statuses,
  today,
  undoCompletion,
  type Backup,
  type CompletionUndo,
  type DailyGoal,
  type Priority,
  type Status,
  type Subject,
  type SubjectDoc,
} from "./model";

import { GroupFields } from "./GroupFields";
import { GroupPanel } from "./GroupPanel";
import { QuickCapture } from "./QuickCapture";
import { PriorityPicker } from "./PriorityPicker";
import { WindowsSettings } from "./WindowsSettings";
import {
  desktopAvailable,
  saveCapture,
  useDesktopIntegration,
} from "./desktop";
import {
  groupSubjects,
  groupPath,
  panelKey,
  readPanels,
  writePanels,
} from "./groups";

const api = config ? new Api(config) : null;
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === "string"
      ? e
      : "Não foi possível concluir. Tente novamente.";
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Sunrise size={24} />
      </span>
      <div>
        <strong>Zenit Day</strong>
        <small>Seu dia e seus acompanhamentos</small>
      </div>
    </div>
  );
}
function Button({
  children,
  onClick,
  kind = "",
  disabled = false,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      className={`button ${kind}`}
      onClick={onClick}
      disabled={disabled}
      type={type}
      title={title}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Fechar">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Login({
  onLogin,
  initialEmail = "",
  onCancel,
}: {
  onLogin: (s: Session) => Promise<void>;
  initialEmail?: string;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState(initialEmail),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!api) return;
    setBusy(true);
    setError("");
    try {
      const s = await api.login(email, password);
      setPassword("");
      await onLogin(s);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="login-form">
      <label>
        E-mail
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          readOnly={!!initialEmail}
          autoFocus={!initialEmail}
        />
      </label>
      <label>
        Senha
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          autoFocus={!!initialEmail}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button kind="primary" type="submit" disabled={busy || !api}>
        {busy ? "Entrando…" : "Entrar no meu espaço"}
        <ArrowRight size={17} />
      </Button>
      {onCancel && (
        <Button onClick={onCancel}>Continuar com os dados locais</Button>
      )}
    </form>
  );
}
export default function App() {
  return desktopAvailable &&
    new URLSearchParams(window.location.search).get("capture") === "1" ? (
    <QuickCapture />
  ) : (
    <MainApp />
  );
}
function MainApp() {
  const [session, setSession] = useState<Session | null>(null),
    [repo, setRepo] = useState<Repository | null>(null),
    [boot, setBoot] = useState(true),
    [fatal, setFatal] = useState("");
  async function open(s: Session) {
    const next = await new Repository(
      `${api!.project.url}|${s.user.id}`,
    ).load();
    setRepo(next);
    setSession(s);
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (api) {
          const s = await api.restore();
          if (s && live) await open(s);
        }
      } catch (e) {
        if (live) setFatal(errorText(e));
      } finally {
        if (live) setBoot(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  if (boot)
    return (
      <div className="loading">
        <Sunrise />
        <p>Abrindo seu espaço…</p>
      </div>
    );
  if (session && repo)
    return (
      <Home
        key={repo.key}
        session={session}
        repo={repo}
        onRelogin={open}
        onLogout={async () => {
          await api!.logout();
          setRepo(null);
          setSession(null);
        }}
      />
    );
  return (
    <main className="login-page">
      <div className="login-presentation">
        <Brand />
        <span className="eyebrow">UM POUCO MAIS DE CLAREZA</span>
        <h1>
          Seu dia, com espaço
          <br />
          para o que importa.
        </h1>
        <p>
          O que fazer. O que acompanhar.
          <br />E o próximo passo de cada assunto.
        </p>
        <div className="login-illustration" aria-hidden="true">
          <div>
            <span className="illustration-icon">
              <CheckCheck />
            </span>
            <strong>Tudo no seu tempo</strong>
            <small>Uma coisa de cada vez.</small>
          </div>
          <div>
            <span className="illustration-icon">
              <UsersRound />
            </span>
            <strong>Acompanhar também é agir</strong>
            <small>Saiba com quem retomar.</small>
          </div>
        </div>
        <small className="login-foot">
          SEU ESPAÇO PESSOAL · WINDOWS + ANDROID
        </small>
      </div>
      <section className="login-card">
        <div className="mobile-brand">
          <Brand />
        </div>
        <span className="eyebrow">BEM-VINDO AO SEU DIA</span>
        <h2>Vamos começar?</h2>
        <p>Entre com a conta que você criou para o Zenit Day.</p>
        {!config ? (
          <p className="error">
            Configure a URL e a chave publicável do Supabase em .env.local e
            gere novamente o aplicativo.
          </p>
        ) : (
          <Login onLogin={open} />
        )}{" "}
        {fatal && (
          <p className="error" role="alert">
            {fatal}
          </p>
        )}
        <div className="login-note">
          <CloudCheck size={19} />
          <span>
            Seus assuntos nos dois dispositivos.
            <br />
            Seu trabalho salvo, mesmo sem internet.
          </span>
        </div>
        {!native && (
          <small className="preview-note">
            Prévia no navegador: a sessão dura até fechar ou recarregar a
            página.
          </small>
        )}
      </section>
    </main>
  );
}

type View = "today" | "all" | "done" | "archive";
type Editor = {
  mode: "new" | "edit" | "progress" | "review";
  subject?: Subject;
  initial?: SubjectDoc;
};
function Home({
  session,
  repo,
  onRelogin,
  onLogout,
}: {
  session: Session;
  repo: Repository;
  onRelogin: (s: Session) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const w = useSyncExternalStore(repo.subscribe, repo.snapshot);
  const [view, setView] = useState<View>("today"),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [capture, setCapture] = useState(""),
    [capturePriority, setCapturePriority] = useState<Priority>("normal"),
    [editor, setEditor] = useState<Editor | null>(null),
    [settings, setSettings] = useState(false),
    [logout, setLogout] = useState(false),
    [relogin, setRelogin] = useState(false),
    [restore, setRestore] = useState<Backup | null>(null);
  const [panels, setPanels] = useState(() => readPanels(repo.key));
  const [searchClosed, setSearchClosed] = useState<Record<string, boolean>>({});
  const listScroll = useRef(0);
  const returnSubject = useRef<string | null>(null);
  useEffect(() => setSearchClosed({}), [query, view, filter]);
  const [goalSaving, setGoalSaving] = useState<string[]>([]);
  const [completing, setCompleting] = useState<string[]>([]);
  const [checklistSaving, setChecklistSaving] = useState<string[]>([]);
  const [undoing, setUndoing] = useState(false);
  const completionBusy = useRef(new Set<string>());
  const undoBusy = useRef(false);
  const [syncState, setSyncState] = useState<"idle" | "running" | "error">(
      "idle",
    ),
    [syncError, setSyncError] = useState(""),
    [toast, setToast] = useState<{
      text: string;
      undo?: CompletionUndo;
    } | null>(null),
    [date, setDate] = useState(today()),
    [online, setOnline] = useState(navigator.onLine);
  const sync = useRef<Synchronizer | null>(null),
    search = useRef<HTMLInputElement>(null),
    captureBusy = useRef(false);
  const notify = (text: string, undo?: CompletionUndo) =>
    setToast({ text, undo });
  async function synchronize() {
    const engine = sync.current;
    if (!engine) return;
    setSyncState("running");
    try {
      await engine.run();
      if (sync.current === engine) {
        setSyncState("idle");
        setSyncError("");
      }
    } catch (e) {
      if (sync.current === engine) {
        setSyncState("error");
        setSyncError(errorText(e));
      }
    }
  }
  useEffect(() => {
    sync.current = new Synchronizer(repo, api!, session.user.id);
    void synchronize();
    const timer = setInterval(() => {
      setDate(today());
      if (navigator.onLine) void synchronize();
    }, 30000);
    const resume = () => {
      setOnline(navigator.onLine);
      setDate(today());
      if (document.visibilityState === "visible" && navigator.onLine)
        void synchronize();
    };
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      sync.current?.stop();
      clearInterval(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [repo]);
  useEffect(() => {
    if (!w.queue.length) return;
    const timer = setTimeout(() => void synchronize(), 700);
    return () => clearTimeout(timer);
  }, [w.queue]);
  useEffect(() => {
    if (!toast || undoing) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 12000 : 5000);
    return () => clearTimeout(timer);
  }, [toast, undoing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditor({ mode: "new" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const subjects = Object.values(w.subjects),
    active = subjects.filter((s) => !s.archived && s.status !== "done");
  const counts = {
    today: active.filter((s) => isToday(s, date)).length,
    all: active.length,
    done: subjects.filter((s) => !s.archived && s.status === "done").length,
    archive: subjects.filter((s) => s.archived).length,
  };
  useDesktopIntegration({
    namespace: repo.key,
    email: session.user.email,
    todayCount: counts.today,
    status: !online
      ? "Sem conexão"
      : syncState === "running"
        ? "Sincronizando…"
        : Object.keys(w.conflicts).length
          ? "Alterações para comparar"
          : w.queue.length
            ? `${w.queue.length} alteração(ões) aguardando envio`
            : syncError
              ? "Verifique a sincronização"
              : "Tudo sincronizado",
    onToday: () => {
      setView("today");
      setSelected(null);
      setQuery("");
      setFilter("all");
    },
    onCapture: async (request) => {
      await saveCapture(repo, session.user.id, request);
      revealGroup(blankDoc(), "today");
      notify("Assunto salvo pela captura rápida.");
      if (navigator.onLine) void synchronize();
    },
  });
  const visible = subjects
    .filter((s) =>
      view === "today"
        ? isToday(s, date)
        : view === "all"
          ? !s.archived && s.status !== "done"
          : view === "done"
            ? !s.archived && s.status === "done"
            : s.archived,
    )
    .filter(
      (s) =>
        filter === "all" ||
        (filter === "self" ? s.responsible_is_self : !s.responsible_is_self),
    )
    .filter((s) =>
      [
        s.title,
        s.next_action,
        s.responsible_name,
        s.project,
        s.subgroup,
        s.situation,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => compareSubjects(a, b, view === "today" ? date : undefined));
  const subject = selected ? w.subjects[selected] : null;
  const grouped = groupSubjects(visible, subjects);
  function savePanels(next: Record<string, boolean>) {
    setPanels(next);
    writePanels(repo.key, next);
  }
  function isPanelOpen(key: string) {
    return query.trim()
      ? !searchClosed[key]
      : (panels[key] ?? view === "today");
  }
  function togglePanel(key: string) {
    if (query.trim())
      setSearchClosed((current) => ({ ...current, [key]: !current[key] }));
    else savePanels({ ...panels, [key]: !isPanelOpen(key) });
  }
  function revealGroup(doc: SubjectDoc, targetView = view) {
    const group = doc.project?.trim() || null;
    savePanels({
      ...panels,
      [panelKey(targetView, group)]: true,
      ...(group && doc.subgroup
        ? { [panelKey(targetView, group, doc.subgroup)]: true }
        : {}),
    });
  }
  function openSubject(id: string) {
    listScroll.current = window.scrollY;
    returnSubject.current = null;
    setSelected(id);
    if (window.matchMedia("(max-width: 720px)").matches)
      requestAnimationFrame(() => window.scrollTo(0, 0));
  }
  function backToList() {
    setSelected(null);
    requestAnimationFrame(() => {
      if (returnSubject.current)
        document
          .getElementById("subject-" + returnSubject.current)
          ?.scrollIntoView({ block: "nearest" });
      else window.scrollTo(0, listScroll.current);
    });
  }
  const pending = (id: string) => w.queue.filter((op) => op.subjectId === id);
  async function save(doc: SubjectDoc, note: string | null, id?: string) {
    const next = id ?? crypto.randomUUID();
    const baseline = editor?.subject;
    await repo.mutate((d) => {
      if (
        baseline &&
        baseline.id === id &&
        id &&
        JSON.stringify(documentOf(d.subjects[id])) !==
          JSON.stringify(documentOf(baseline))
      )
        throw new Error(
          "Este assunto mudou enquanto o formulário estava aberto. Seu texto continua aqui: copie-o e reabra a edição para conferir a versão atual.",
        );
      enqueue(d, session.user.id, next, doc, note);
    });
    const targetView = view === "today" && !isToday(doc, date) ? "all" : view;
    revealGroup(doc, targetView);
    returnSubject.current = next;
    setSelected(next);
    setEditor(null);
    if (!isToday({ ...doc } as Subject, date) && view === "today")
      setView("all");
    notify(
      online
        ? "Salvo neste dispositivo. Sincronização em andamento."
        : "Salvo neste dispositivo. Enviaremos quando houver conexão.",
    );
  }
  async function change(s: Subject, patch: Partial<SubjectDoc>) {
    try {
      await save({ ...documentOf(s), ...patch }, null, s.id);
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function complete(id: string) {
    if (completionBusy.current.has(id)) return;
    completionBusy.current.add(id);
    setCompleting((ids) => [...ids, id]);
    try {
      let undo: CompletionUndo | null = null;
      await repo.mutate((draft) => {
        undo = completeSubject(draft, session.user.id, id);
      });
      if (undo) {
        if (selected === id) setSelected(null);
        notify("Assunto concluído.", undo);
      }
    } catch (e) {
      notify(errorText(e));
    } finally {
      completionBusy.current.delete(id);
      setCompleting((ids) => ids.filter((key) => key !== id));
    }
  }
  async function undoComplete(undo: CompletionUndo) {
    if (undoBusy.current) return;
    undoBusy.current = true;
    setUndoing(true);
    try {
      await repo.mutate((draft) =>
        undoCompletion(draft, session.user.id, undo),
      );
      notify(`Conclusão desfeita. Status: ${statuses[undo.previousStatus]}.`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      undoBusy.current = false;
      setUndoing(false);
    }
  }
  async function changeGoal(id: string, goal: DailyGoal | null) {
    setGoalSaving((ids) => [...ids, id]);
    try {
      const currentDay = today();
      await repo.mutate((draft) =>
        setDailyGoal(draft, session.user.id, id, goal, currentDay),
      );
      setDate(currentDay);
      notify(
        goal
          ? `Meta de hoje: ${dailyGoals[goal]}. Salva neste dispositivo.`
          : "Meta de hoje removida.",
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setGoalSaving((ids) => ids.filter((key) => key !== id));
    }
  }
  async function checkItem(id: string, itemId: string, done: boolean) {
    setChecklistSaving((ids) => [...ids, itemId]);
    try {
      await repo.mutate((draft) =>
        setChecklistItem(draft, session.user.id, id, itemId, done),
      );
    } catch (e) {
      notify(errorText(e));
    } finally {
      setChecklistSaving((ids) => ids.filter((key) => key !== itemId));
    }
  }
  async function exportBackup() {
    try {
      const backup: Backup = {
        format: "zenit-day",
        version: 1,
        exportedAt: new Date().toISOString(),
        userId: session.user.id,
        project: api!.project.url,
        workspace: repo.current,
      };
      if (await exportFile(JSON.stringify(backup, null, 2)))
        notify("Cópia exportada com assuntos, histórico e alterações locais.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function loadBackup() {
    try {
      const text = await importFile();
      if (text)
        setRestore(parseBackup(text, session.user.id, api!.project.url));
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function restoreCopies() {
    if (!restore) return;
    try {
      await repo.mutate((d) => {
        for (const s of Object.values(restore.workspace.subjects))
          enqueue(
            d,
            session.user.id,
            crypto.randomUUID(),
            documentOf(s),
            `Restaurado da cópia de ${new Date(restore.exportedAt).toLocaleDateString("pt-BR")}.`,
          );
      });
      setRestore(null);
      setSettings(false);
      setView("all");
      notify(
        "Assuntos restaurados como novas cópias. Os registros existentes foram preservados.",
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function resolve(id: string, choice: "local" | "remote") {
    try {
      await repo.mutate((d) => resolveConflict(d, session.user.id, id, choice));
      notify("Versão escolhida. Uma cópia local foi preservada em Ajustes.");
    } catch (e) {
      notify(errorText(e));
    }
  }
  const renderSubject = (s: Subject) => (
    <article
      className={`subject-card ${s.id === selected ? "selected" : ""} ${dailyGoalFor(s, date) === "not_today" ? "not-today" : ""}`}
      key={s.id}
      id={`subject-${s.id}`}
    >
      <button
        className="subject-open"
        onClick={() => openSubject(s.id)}
        aria-pressed={s.id === selected}
      >
        <div className="card-heading">
          <strong>{s.title}</strong>
          <span className={`status ${s.status}`}>{statuses[s.status]}</span>
        </div>
        {priorityOf(s) !== "normal" && (
          <span className={`priority-badge ${priorityOf(s)}`}>
            {priorities[priorityOf(s)]}
          </span>
        )}
        {s.next_action && (
          <p className="next-preview">
            <ArrowRight size={13} />
            {s.next_action}
          </p>
        )}
        <div className="card-meta">
          <span
            className={`small-avatar ${s.responsible_is_self ? "self" : ""}`}
          >
            {s.responsible_is_self ? (
              <UserRound size={12} />
            ) : (
              s.responsible_name?.[0]?.toUpperCase()
            )}
          </span>
          <span>{s.responsible_is_self ? "Você" : s.responsible_name}</span>
          {s.project && <span className="project-tag">{groupPath(s)}</span>}
          <span
            className={`review-date ${s.review_on && s.review_on < date ? "overdue" : ""}`}
          >
            {w.conflicts[s.id]
              ? "Comparar versões"
              : pending(s.id).length
                ? "Salvo localmente"
                : s.review_on
                  ? `Retomar ${dayLabel(s.review_on)}`
                  : "Sem retomada"}
          </span>
        </div>
        {s.due_on && s.due_on <= date && s.status !== "done" && (
          <div className="deadline-note">
            Prazo {s.due_on === date ? "hoje" : `em ${dayLabel(s.due_on)}`}
          </div>
        )}
        {!!s.checklist?.length && (
          <span className="checklist-progress">
            <ListChecks size={14} />
            {s.checklist.filter((item) => item.done).length} de{" "}
            {s.checklist.length} itens
          </span>
        )}
      </button>
      {!s.archived && s.status !== "done" && (
        <div className="subject-card-actions">
          <DailyGoalPicker
            subject={s}
            date={date}
            disabled={
              !!w.conflicts[s.id] ||
              goalSaving.includes(s.id) ||
              completing.includes(s.id)
            }
            onChange={(goal) => void changeGoal(s.id, goal)}
          />
          <button
            className="complete-subject"
            aria-label={`Concluir ${s.title}`}
            disabled={
              !!w.conflicts[s.id] ||
              goalSaving.includes(s.id) ||
              completing.includes(s.id)
            }
            onClick={() => void complete(s.id)}
          >
            <Check size={15} />
            {completing.includes(s.id) ? "Concluindo…" : "Concluir"}
          </button>
        </div>
      )}
    </article>
  );
  const titles = {
    today: "Hoje",
    all: "Acompanhamentos",
    done: "Concluídos",
    archive: "Arquivados",
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="top-actions">
          <button
            className={`sync-pill ${syncState === "error" ? "sync-error" : ""}`}
            aria-label="Sincronizar agora"
            onClick={() => void synchronize()}
            title={syncError || "Sincronizar agora"}
          >
            {syncState === "running" ? (
              <RefreshCw size={15} className="spin" />
            ) : !online || syncState === "error" ? (
              <CloudOff size={16} />
            ) : (
              <CloudCheck size={16} />
            )}
            <span>
              {syncState === "running"
                ? "Sincronizando…"
                : !online
                  ? "Sem conexão"
                  : w.queue.length
                    ? `${w.queue.length} pendente${w.queue.length > 1 ? "s" : ""}`
                    : syncState === "error"
                      ? "Conexão pendente"
                      : "Tudo sincronizado"}
            </span>
          </button>
          <button
            className="icon-button"
            onClick={() => setSettings(true)}
            aria-label="Ajustes"
          >
            <Settings size={20} />
          </button>
          <span className="account-avatar" title={session.user.email}>
            {session.user.email[0]?.toUpperCase()}
          </span>
        </div>
      </header>
      <nav className="navigation" aria-label="Visões dos assuntos">
        {(["today", "all", "done"] as View[]).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            onClick={() => {
              setView(v);
              setSelected(null);
            }}
          >
            {titles[v]}
            <span>{counts[v]}</span>
          </button>
        ))}
        <button
          className="archive-nav"
          aria-label="Arquivados"
          aria-pressed={view === "archive"}
          onClick={() => {
            setView("archive");
            setSelected(null);
          }}
        >
          <Archive size={17} />
          <span className="archive-label">Arquivados</span>
        </button>
      </nav>
      <main className={`workspace ${subject ? "has-selection" : ""}`}>
        <div className="heading">
          <div>
            <span className="eyebrow">SEU ESPAÇO PESSOAL</span>
            <h1>{titles[view]}</h1>
            <p>
              {view === "today"
                ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : view === "all"
                  ? "O que você faz e o que precisa acompanhar."
                  : view === "done"
                    ? "Um registro do que já avançou."
                    : "Assuntos guardados, disponíveis para retomar."}
            </p>
          </div>
          <Button kind="primary" onClick={() => setEditor({ mode: "new" })}>
            <Plus size={18} />
            Novo assunto
          </Button>
        </div>
        {syncError && (
          <div className="connection-banner">
            <CloudOff size={18} />
            <p>{syncError}</p>
            <button onClick={() => api!.session && setRelogin(true)}>
              Entrar novamente
            </button>
          </div>
        )}
        {Object.keys(w.conflicts).length > 0 && (
          <div className="conflict-banner">
            <span>
              {Object.keys(w.conflicts).length} assunto(s) com alterações em
              dois dispositivos.
            </span>
            <button
              onClick={() => {
                setSelected(Object.keys(w.conflicts)[0]);
                setView("all");
              }}
            >
              Comparar versões
              <ArrowRight size={15} />
            </button>
          </div>
        )}
        <div className="workspace-grid">
          <section className="list-panel" aria-label="Assuntos">
            <form
              className="quick-capture"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!capture.trim() || captureBusy.current) return;
                captureBusy.current = true;
                try {
                  await save(blankDoc(capture.trim(), capturePriority), null);
                  setCapture("");
                  setCapturePriority("normal");
                } catch (e) {
                  notify(errorText(e));
                } finally {
                  captureBusy.current = false;
                }
              }}
            >
              <Plus size={19} />
              <input
                aria-label="Adicionar assunto para hoje"
                placeholder="Anote algo para hoje…"
                maxLength={200}
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
              />
              <PriorityPicker
                value={capturePriority}
                onChange={setCapturePriority}
              />
              <button
                type="submit"
                aria-label="Adicionar"
                disabled={!capture.trim()}
              >
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="list-tools">
              <div className="search">
                <Search size={16} />
                <input
                  ref={search}
                  aria-label="Buscar assuntos"
                  placeholder="Buscar assunto, pessoa, grupo…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Limpar busca"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                aria-label="Filtrar responsável"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="self">Comigo</option>
                <option value="others">Com outras pessoas</option>
              </select>
            </div>
            <div className="section-label">
              <span>
                {view === "today" ? "PARA HOJE" : titles[view].toUpperCase()}
              </span>
              <span>
                {visible.length} assunto{visible.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="subject-list">
              {!!grouped.ungrouped.length && (
                <GroupPanel
                  name="Sem grupo"
                  ariaLabel="Sem grupo"
                  count={grouped.ungrouped.length}
                  open={isPanelOpen(panelKey(view, null))}
                  onToggle={() => togglePanel(panelKey(view, null))}
                >
                  {grouped.ungrouped.map(renderSubject)}
                </GroupPanel>
              )}
              {grouped.groups.map((group) => (
                <GroupPanel
                  key={group.name}
                  name={group.name}
                  count={group.total}
                  open={isPanelOpen(panelKey(view, group.name))}
                  onToggle={() => togglePanel(panelKey(view, group.name))}
                >
                  {group.direct.map(renderSubject)}
                  {group.subgroups.map((subgroup) => (
                    <GroupPanel
                      key={subgroup.name}
                      name={subgroup.name}
                      count={subgroup.subjects.length}
                      nested
                      open={isPanelOpen(
                        panelKey(view, group.name, subgroup.name),
                      )}
                      onToggle={() =>
                        togglePanel(panelKey(view, group.name, subgroup.name))
                      }
                    >
                      {subgroup.subjects.map(renderSubject)}
                    </GroupPanel>
                  ))}
                </GroupPanel>
              ))}
            </div>
            {!visible.length && (
              <div className="empty-list">
                <span>
                  <Sunrise size={31} />
                </span>
                <h3>
                  {query
                    ? "Nada encontrado"
                    : view === "today"
                      ? "Um espaço livre no seu dia"
                      : "Ainda não há assuntos aqui"}
                </h3>
                <p>
                  {query
                    ? "Tente outro termo ou responsável."
                    : view === "today"
                      ? "Adicione algo para hoje ou veja o que está em Acompanhamentos."
                      : "Comece com o assunto e o próximo passo. O resto pode vir depois."}
                </p>
                {!query && view === "today" && counts.all > 0 && (
                  <Button onClick={() => setView("all")}>
                    Ver acompanhamentos
                    <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            )}
          </section>
          <aside className="detail-panel" aria-label="Detalhes do assunto">
            {subject ? (
              <>
                <button className="mobile-back" onClick={backToList}>
                  <ArrowLeft size={17} />
                  Voltar aos assuntos
                </button>
                <div className="detail-top">
                  <span>{groupPath(subject) || "ASSUNTO PESSOAL"}</span>
                  <span className={`status ${subject.status}`}>
                    {statuses[subject.status]}
                  </span>
                </div>
                <h2>{subject.title}</h2>
                <div className="detail-priority">
                  Prioridade{" "}
                  <span className={`priority-badge ${priorityOf(subject)}`}>
                    {priorities[priorityOf(subject)]}
                  </span>
                </div>
                <div className="attributes">
                  <div>
                    <small>Responsável pela execução</small>
                    <span>
                      <UserRound size={15} />
                      {subject.responsible_is_self
                        ? "Você"
                        : subject.responsible_name}
                    </span>
                  </div>
                  <div>
                    <small>Prazo final</small>
                    <span
                      className={
                        subject.due_on &&
                        subject.due_on < date &&
                        subject.status !== "done"
                          ? "overdue"
                          : ""
                      }
                    >
                      {subject.due_on
                        ? dayLabel(subject.due_on)
                        : "Não definido"}
                    </span>
                  </div>
                </div>
                {!subject.archived && subject.status !== "done" && (
                  <section className="daily-goal-detail">
                    <DailyGoalPicker
                      subject={subject}
                      date={date}
                      disabled={
                        !!w.conflicts[subject.id] ||
                        goalSaving.includes(subject.id)
                      }
                      onChange={(goal) => void changeGoal(subject.id, goal)}
                    />
                    <p>
                      {dailyGoalFor(subject, date) === "not_today"
                        ? "Menos destaque hoje. Seu prazo continua visível."
                        : "O que você pretende fazer hoje. O status e o prazo continuam iguais."}
                    </p>
                    {subject.daily_goal &&
                      subject.daily_goal_on &&
                      subject.daily_goal_on !== date && (
                        <small>
                          Última meta: {dailyGoals[subject.daily_goal]} ·{" "}
                          {dayLabel(subject.daily_goal_on)}
                        </small>
                      )}
                  </section>
                )}
                {!!subject.checklist?.length && (
                  <section
                    className="subject-checklist"
                    aria-label="Checklist do assunto"
                  >
                    <div className="checklist-heading">
                      <h3>
                        <ListChecks size={16} />
                        Checklist
                      </h3>
                      <small>
                        {subject.checklist.filter((item) => item.done).length}{" "}
                        de {subject.checklist.length} itens
                      </small>
                    </div>
                    {subject.checklist.map((item) => (
                      <label
                        className={`checklist-item ${item.done ? "checked" : ""}`}
                        key={item.id}
                      >
                        <input
                          type="checkbox"
                          checked={item.done}
                          disabled={
                            subject.archived ||
                            !!w.conflicts[subject.id] ||
                            checklistSaving.includes(item.id)
                          }
                          onChange={(e) =>
                            void checkItem(
                              subject.id,
                              item.id,
                              e.target.checked,
                            )
                          }
                        />
                        <span>{item.text}</span>
                      </label>
                    ))}
                  </section>
                )}
                <section className="situation">
                  <small>Situação atual</small>
                  <p>
                    {subject.situation ||
                      "Ainda sem atualização. Registre o que você já sabe sobre este assunto."}
                  </p>
                </section>
                <section className="next-step">
                  <small>MEU PRÓXIMO PASSO</small>
                  <p>
                    {subject.next_action ||
                      "Qual é a próxima ação que depende de você?"}
                  </p>
                  <div>
                    <span>
                      Retomar em <strong>{dayLabel(subject.review_on)}</strong>
                    </span>
                    <button
                      onClick={() => setEditor({ mode: "review", subject })}
                      disabled={!!w.conflicts[subject.id]}
                    >
                      Reagendar
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </section>
                {w.conflicts[subject.id] ? (
                  <ConflictView
                    local={subject}
                    remote={w.conflicts[subject.id].remote}
                    onResolve={(choice) => void resolve(subject.id, choice)}
                  />
                ) : (
                  <>
                    <div className="detail-actions">
                      <Button
                        kind="primary"
                        onClick={() => setEditor({ mode: "progress", subject })}
                      >
                        <MessageSquarePlus size={17} />
                        Registrar andamento
                      </Button>
                      <Button
                        onClick={() => setEditor({ mode: "edit", subject })}
                      >
                        Editar
                      </Button>
                    </div>
                    <div className="secondary-actions">
                      <button
                        disabled={
                          subject.archived || completing.includes(subject.id)
                        }
                        onClick={() =>
                          subject.status === "done"
                            ? void change(subject, { status: "todo" })
                            : void complete(subject.id)
                        }
                      >
                        <Check size={16} />
                        {subject.status === "done"
                          ? "Reabrir assunto"
                          : "Concluir assunto"}
                      </button>
                      <button
                        onClick={() =>
                          void change(subject, { archived: !subject.archived })
                        }
                      >
                        <Archive size={15} />
                        {subject.archived ? "Restaurar" : "Arquivar"}
                      </button>
                    </div>
                  </>
                )}
                <section className="history">
                  <h3>
                    <History size={16} />
                    Histórico
                  </h3>
                  {[...pending(subject.id)].reverse().map((op) => (
                    <div className="history-item" key={op.id}>
                      <span className="history-dot pending" />
                      <p>
                        {op.note || "Alteração salva neste dispositivo"}
                        <small>
                          {new Date(op.createdAt).toLocaleString("pt-BR")} ·
                          aguardando envio
                        </small>
                      </p>
                    </div>
                  ))}
                  {w.history
                    .filter((h) => h.subject_id === subject.id)
                    .sort((a, b) => b.subject_revision - a.subject_revision)
                    .map((h) => (
                      <div className="history-item" key={h.id}>
                        <span className="history-dot" />
                        <p>
                          {h.note ||
                            ({
                              created: "Assunto criado",
                              updated: "Assunto atualizado",
                              progress: "Andamento registrado",
                              completed: "Assunto concluído",
                              reopened: "Assunto reaberto",
                              archived: "Assunto arquivado",
                              restored: "Assunto restaurado",
                            }[h.kind] ??
                              "Atualização")}
                          <small>
                            {new Date(h.created_at).toLocaleString("pt-BR")}
                          </small>
                        </p>
                      </div>
                    ))}
                  {!pending(subject.id).length &&
                    !w.history.some((h) => h.subject_id === subject.id) && (
                      <p className="muted">
                        O histórico aparecerá após a sincronização.
                      </p>
                    )}
                </section>
              </>
            ) : (
              <div className="detail-placeholder">
                <span>
                  <Sunrise size={44} />
                </span>
                <h2>Um assunto de cada vez.</h2>
                <p>
                  Selecione um acompanhamento para ver a situação e decidir o
                  próximo passo.
                </p>
                <div>
                  <Circle size={8} />
                  Menos esforço para lembrar. Mais clareza para agir.
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <footer className="app-footer">
        <span>
          {active.length} assunto{active.length === 1 ? "" : "s"} em aberto ·{" "}
          {active.filter((s) => !s.responsible_is_self).length} com outras
          pessoas
        </span>
        <span>
          {!native
            ? "Prévia no navegador"
            : w.lastSync
              ? `Última sincronização às ${new Date(w.lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Seu trabalho fica salvo neste dispositivo"}
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              disabled={undoing}
              onClick={() => void undoComplete(toast.undo!)}
            >
              {undoing ? "Desfazendo…" : "Desfazer"}
            </button>
          )}
          <button
            aria-label="Dispensar mensagem"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editor && (
        <EditorDialog
          key={`${editor.mode}-${editor.subject?.id ?? "new"}`}
          editor={editor}
          subjects={subjects}
          close={() => setEditor(null)}
          save={save}
        />
      )}
      {settings && (
        <Modal title="Seu espaço" close={() => setSettings(false)}>
          <div className="account-box">
            <span className="account-avatar">
              {session.user.email[0]?.toUpperCase()}
            </span>
            <div>
              <strong>Conta pessoal</strong>
              <p>{session.user.email}</p>
            </div>
          </div>
          <p className="muted">
            Os assuntos desta conta ficam separados dos dados de outros
            usuários.
          </p>
          <WindowsSettings />
          <div className="settings-section">
            <h3>Cópia dos seus assuntos</h3>
            <p>
              Exporte uma cópia independente com os dados deste dispositivo,
              inclusive alterações ainda não sincronizadas.
            </p>
            <div className="button-row">
              <Button onClick={() => void exportBackup()}>
                <Download size={17} />
                Exportar cópia
              </Button>
              <Button onClick={() => void loadBackup()}>
                <Upload size={17} />
                Restaurar assuntos
              </Button>
            </div>
          </div>
          {w.recovery.length > 0 && (
            <div className="settings-section">
              <h3>Versões locais preservadas</h3>
              <p>
                Alternativas guardadas quando você resolveu alterações entre
                dispositivos.
              </p>
              {w.recovery.map((r, i) => (
                <button
                  className="recovery-row"
                  key={i}
                  onClick={() => {
                    setSettings(false);
                    setEditor({ mode: "new", initial: documentOf(r.subject) });
                  }}
                >
                  <span>
                    {r.subject.title}
                    <small>{new Date(r.savedAt).toLocaleString("pt-BR")}</small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="settings-section">
            <Button
              onClick={() => {
                setSettings(false);
                setLogout(true);
              }}
            >
              <LogOut size={17} />
              Sair da conta
            </Button>
            <small className="version">Zenit Day · versão 0.1.8</small>
          </div>
        </Modal>
      )}
      {logout && (
        <Modal title="Sair desta conta?" close={() => setLogout(false)}>
          <p>
            Os dados locais serão preservados para quando você entrar novamente
            com esta conta.
          </p>
          {w.queue.length > 0 && (
            <p className="warning">
              Há {w.queue.length} alteração(ões) aguardando sincronização neste
              dispositivo.
            </p>
          )}
          <div className="modal-actions">
            <Button onClick={() => setLogout(false)}>Continuar aqui</Button>
            <Button
              kind="primary"
              onClick={() => {
                sync.current?.stop();
                void onLogout().catch((e) => notify(errorText(e)));
              }}
            >
              Sair da conta
            </Button>
          </div>
        </Modal>
      )}
      {relogin && (
        <Modal title="Renovar sua sessão" close={() => setRelogin(false)}>
          <Login
            initialEmail={session.user.email}
            onLogin={async (s) => {
              if (s.user.id !== session.user.id) throw new LoginRequired();
              await onRelogin(s);
              setRelogin(false);
            }}
            onCancel={() => setRelogin(false)}
          />
        </Modal>
      )}
      {restore && (
        <Modal
          title="Restaurar como novos assuntos?"
          close={() => setRestore(null)}
        >
          <p>
            A cópia contém{" "}
            <strong>
              {Object.keys(restore.workspace.subjects).length} assuntos
            </strong>
            . Eles serão adicionados como cópias, com situação, responsável,
            datas e próximo passo. Os assuntos existentes permanecem como estão.
          </p>
          <p className="muted">
            O histórico anterior continua no arquivo exportado. As novas cópias
            começam com um registro de restauração.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setRestore(null)}>Cancelar</Button>
            <Button kind="primary" onClick={() => void restoreCopies()}>
              Restaurar cópias
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditorDialog({
  editor,
  subjects,
  close,
  save,
}: {
  editor: Editor;
  subjects: Subject[];
  close: () => void;
  save: (doc: SubjectDoc, note: string | null, id?: string) => Promise<void>;
}) {
  const [doc, setDoc] = useState<SubjectDoc>(
      editor.subject
        ? documentOf(editor.subject)
        : (editor.initial ?? blankDoc()),
    ),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mode = editor.mode;
  const full = mode === "new" || mode === "edit";
  const change = <K extends keyof SubjectDoc>(key: K, value: SubjectDoc[K]) =>
    setDoc((d) => ({ ...d, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "progress" && !note.trim())
        throw new Error("Escreva o andamento que deseja registrar.");
      await save(
        {
          ...doc,
          title: doc.title.trim(),
          project: doc.project?.trim() || null,
          ...(full
            ? {
                subgroup: doc.project?.trim()
                  ? doc.subgroup?.trim() || null
                  : null,
              }
            : {}),
          situation: mode === "progress" ? note.trim() : doc.situation,
        },
        mode === "progress" ? note : null,
        editor.subject?.id,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        {
          new: "Novo assunto",
          edit: "Editar assunto",
          progress: "Registrar andamento",
          review: "Quando retomar?",
        }[mode]
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form onSubmit={submit} className="editor-form">
        {full ? (
          <>
            <label>
              Assunto
              <input
                required
                maxLength={200}
                autoFocus
                value={doc.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder="O que você precisa fazer ou acompanhar?"
              />
            </label>
            <label>
              Responsável pela execução
              <select
                value={doc.responsible_is_self ? "self" : "other"}
                onChange={(e) =>
                  change("responsible_is_self", e.target.value === "self")
                }
              >
                <option value="self">Eu mesmo</option>
                <option value="other">Outra pessoa</option>
              </select>
            </label>
            <PriorityPicker
              value={priorityOf(doc)}
              onChange={(value) => change("priority", value)}
              disabled={busy}
            />
            <GroupFields
              doc={doc}
              subjects={subjects}
              disabled={busy}
              onChange={(project, subgroup) =>
                setDoc((d) => ({ ...d, project, subgroup }))
              }
            />
            {!doc.responsible_is_self && (
              <label>
                Nome do responsável
                <input
                  required
                  maxLength={200}
                  value={doc.responsible_name ?? ""}
                  onChange={(e) =>
                    change("responsible_name", e.target.value || null)
                  }
                  placeholder="Quem está cuidando disso?"
                />
                <small>Nome para seu acompanhamento pessoal.</small>
              </label>
            )}
            <div className="form-grid">
              <label>
                Status
                <select
                  value={doc.status}
                  onChange={(e) => change("status", e.target.value as Status)}
                >
                  {Object.entries(statuses).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo final <span className="optional">opcional</span>
                <input
                  type="date"
                  value={doc.due_on ?? ""}
                  onChange={(e) => change("due_on", e.target.value || null)}
                />
              </label>
            </div>
            <label>
              Situação atual <span className="optional">opcional</span>
              <textarea
                rows={3}
                maxLength={8000}
                value={doc.situation}
                onChange={(e) => change("situation", e.target.value)}
                placeholder="O que você já sabe?"
              />
            </label>
          </>
        ) : mode === "progress" ? (
          <>
            <p className="muted">{editor.subject?.title}</p>
            <label>
              O que aconteceu?
              <textarea
                required
                autoFocus
                rows={4}
                maxLength={8000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Registre a conversa, uma resposta ou o avanço…"
              />
            </label>
            <label>
              Status após este andamento
              <select
                value={doc.status}
                onChange={(e) => change("status", e.target.value as Status)}
              >
                {Object.entries(statuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-hint">
              O status só muda se você escolher outro. O prazo final será
              preservado.
            </p>
          </>
        ) : (
          <p className="muted">
            Escolha quando este assunto deve voltar à sua atenção. O prazo final
            permanece {doc.due_on ? `em ${dayLabel(doc.due_on)}` : "sem data"}.
          </p>
        )}
        {mode !== "review" && (
          <label>
            Meu próximo passo <span className="optional">opcional</span>
            <input
              maxLength={2000}
              value={doc.next_action}
              onChange={(e) => change("next_action", e.target.value)}
              placeholder="Ex.: Confirmar o resultado com a responsável"
            />
          </label>
        )}
        {full && (
          <section className="checklist-editor" aria-label="Editar checklist">
            <div className="checklist-heading">
              <h3>
                Checklist <span className="optional">opcional</span>
              </h3>
              <small>
                {doc.checklist?.length ?? 0}/{checklistLimit}
              </small>
            </div>
            {!doc.checklist?.length && (
              <p className="muted">Divida o assunto em pequenos passos.</p>
            )}
            {doc.checklist?.map((item, index) => (
              <div className="checklist-edit-row" key={item.id}>
                <label className="checklist-check-control">
                  <input
                    type="checkbox"
                    aria-label={`Concluído: item ${index + 1}`}
                    checked={item.done}
                    disabled={busy}
                    onChange={(e) =>
                      change(
                        "checklist",
                        doc.checklist!.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, done: e.target.checked }
                            : entry,
                        ),
                      )
                    }
                  />
                </label>
                <input
                  className="checklist-text"
                  aria-label={`Item ${index + 1} do checklist`}
                  required
                  maxLength={checklistTextLimit}
                  autoFocus={!item.text}
                  value={item.text}
                  disabled={busy}
                  placeholder="O que precisa ser feito?"
                  onChange={(e) =>
                    change(
                      "checklist",
                      doc.checklist!.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, text: e.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="checklist-remove"
                  aria-label={`Remover item ${index + 1}`}
                  disabled={busy}
                  onClick={() =>
                    change(
                      "checklist",
                      doc.checklist!.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button
              disabled={busy || (doc.checklist?.length ?? 0) >= checklistLimit}
              onClick={() =>
                change("checklist", [
                  ...(doc.checklist ?? []),
                  { id: crypto.randomUUID(), text: "", done: false },
                ])
              }
            >
              <Plus size={16} />
              Adicionar item
            </Button>
          </section>
        )}
        <label>
          Retomar em <span className="optional">opcional</span>
          <input
            type="date"
            autoFocus={mode === "review"}
            value={doc.review_on ?? ""}
            onChange={(e) => change("review_on", e.target.value || null)}
          />
          <small>Quando você quer voltar a olhar este assunto.</small>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" kind="primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : mode === "review"
                ? "Reagendar"
                : mode === "progress"
                  ? "Registrar andamento"
                  : "Salvar assunto"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ConflictView({
  local,
  remote,
  onResolve,
}: {
  local: Subject;
  remote: Subject | null;
  onResolve: (choice: "local" | "remote") => void;
}) {
  return (
    <section className="conflict-card">
      <h3>Este assunto mudou em dois lugares</h3>
      <p>
        Compare antes de continuar. A versão local será guardada em Ajustes,
        qualquer que seja sua escolha.
      </p>
      <div className="conflict-versions">
        {[
          ["Neste dispositivo", local],
          ["No outro dispositivo", remote],
        ].map(([label, s]) => {
          const value = s as Subject | null;
          return (
            <div key={label as string}>
              <strong>{label as string}</strong>
              {value ? (
                <>
                  <p>{value.title}</p>
                  <small>{statuses[value.status]}</small>
                  <p>{value.situation || "Sem atualização"}</p>
                  <p>
                    <b>Próximo passo:</b> {value.next_action || "Não definido"}
                  </p>
                  <div className="conflict-checklist">
                    <b>Checklist</b>
                    {value.checklist?.length ? (
                      value.checklist.map((item) => (
                        <p key={item.id}>
                          {item.done ? "✓" : "○"} {item.text}
                        </p>
                      ))
                    ) : (
                      <p>Sem itens</p>
                    )}
                  </div>
                  <small>
                    Responsável:{" "}
                    {value.responsible_is_self
                      ? "Você"
                      : value.responsible_name}
                    <br />
                    Grupo: {groupPath(value) || "Sem grupo"}
                    <br />
                    Prioridade: {priorities[priorityOf(value)]}
                    <br />
                    Retomar: {dayLabel(value.review_on)}
                    <br />
                    Prazo: {dayLabel(value.due_on)}
                    <br />
                    Meta:{" "}
                    {value.daily_goal
                      ? `${dailyGoals[value.daily_goal]} · ${dayLabel(value.daily_goal_on ?? null)}`
                      : "Não definida"}
                    <br />
                    {value.archived ? "Arquivado" : "Não arquivado"}
                  </small>
                </>
              ) : (
                <p>O assunto não foi encontrado nesta conta no servidor.</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="button-row">
        <Button kind="primary" onClick={() => onResolve("local")}>
          Usar minha versão
        </Button>
        <Button onClick={() => onResolve("remote")}>Usar a outra versão</Button>
      </div>
    </section>
  );
}

function DailyGoalPicker({
  subject,
  date,
  disabled,
  onChange,
}: {
  subject: Subject;
  date: string;
  disabled: boolean;
  onChange: (goal: DailyGoal | null) => void;
}) {
  const id = useId();
  const goal = dailyGoalFor(subject, date);
  return (
    <div className={`daily-goal ${goal ? `goal-${goal}` : ""}`}>
      <label htmlFor={id}>
        <Target size={14} />
        Meta de hoje
      </label>
      <select
        id={id}
        aria-label={`Meta de hoje para ${subject.title}`}
        value={goal ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange((event.target.value || null) as DailyGoal | null)
        }
      >
        <option value="">Sem meta</option>
        {Object.entries(dailyGoals).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
