"use client";

import {
  Activity as ActivityIcon,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileKey2,
  FileUp,
  Fingerprint,
  Gauge,
  GitBranch,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  LockKeyhole,
  Menu,
  MessageSquareLock,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserCog,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  activity,
  createId,
  createInitialState,
  isAppState,
  loadLocalRepository,
  mergeStates,
  saveLocalRepository,
  type SyncMeta,
} from "./lib/state";
import {
  downloadEnvelope,
  envelopeToMessage,
  openBackup,
  protectBackup,
  protectMessage,
  revealMessage,
  validateEnvelope,
} from "./lib/secure-message";
import {
  buildMessageTree,
  postOrderMessages,
  searchTitlePrefix,
  type MessageTreeNode,
} from "./lib/message-binary-tree";
import type {
  Activity,
  AppState,
  AuthenticatedUser,
  Collaborator,
  MessageStatus,
  Priority,
  ProtectedMessage,
  Role,
  SecureMessageEnvelope,
  View,
} from "./types";

const statusLabel: Record<MessageStatus, string> = {
  draft: "Rascunho",
  waiting: "Aguardando",
  delivered: "Entregue",
  revealed: "Revelada",
  expired: "Expirada",
  revoked: "Revogada",
};

const priorityLabel: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};

const adminNavigation: { id: View; label: string; icon: typeof Shield }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "compose", label: "Nova mensagem", icon: MessageSquareLock },
  { id: "messages", label: "Mensagens", icon: Inbox },
  { id: "binary-tree", label: "Árvore pós-ordem", icon: GitBranch },
  { id: "collaborators", label: "Colaboradores", icon: Users },
  { id: "activity", label: "Atividades", icon: ActivityIcon },
  { id: "settings", label: "Configurações", icon: Settings },
];

const userNavigation: { id: View; label: string; icon: typeof Shield }[] = [
  { id: "inbox", label: "Minha central", icon: Inbox },
  { id: "activity", label: "Meu histórico", icon: History },
  { id: "settings", label: "Preferências", icon: Settings },
];

type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";

function formatDate(value: string, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function weekdayDate(value: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function relativeDate(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const days = Math.round(difference / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (days > 0 && days < 30) return `em ${days} dias`;
  if (days < 0 && days > -30) return `há ${Math.abs(days)} dias`;
  return formatDate(value, false);
}

function localDateTime(days = 7) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function effectiveStatus(message: ProtectedMessage): MessageStatus {
  if (
    !["draft", "revoked", "revealed"].includes(message.status) &&
    new Date(message.expiresAt).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return message.status;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(value: string, filename: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="Iago Security">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-core" />
      </span>
      {!compact && (
        <span className="brand-type">
          <strong>Iago Security</strong>
          <small>Central de Segurança</small>
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MessageStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {statusLabel[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority priority-${priority}`}>{priorityLabel[priority]}</span>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Shield;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function LoadingVault() {
  return (
    <main className="loading-vault">
      <Logo />
      <div className="vault-loader" aria-label="Abrindo cofre">
        <span /><span /><span />
      </div>
      <p>Verificando o cofre deste dispositivo…</p>
    </main>
  );
}

function AccessGate({
  user,
  onEnter,
}: {
  user: AuthenticatedUser;
  onEnter: (role: Role, remember: boolean) => void;
}) {
  const [role, setRole] = useState<Role>("admin");
  const [remember, setRemember] = useState(true);
  const [entering, setEntering] = useState(false);

  const enter = () => {
    setEntering(true);
    window.setTimeout(() => onEnter(role, remember), 520);
  };

  return (
    <main className="access-shell">
      <div className="access-ambient access-ambient-a" />
      <div className="access-ambient access-ambient-b" />
      <section className="access-story">
        <Logo />
        <div className="access-copy">
          <span className="eyebrow"><ShieldCheck /> Ambiente privado verificado</span>
          <h1>Informação sensível,<br /><em>sob controle.</em></h1>
          <p>Crie, transporte e revele mensagens protegidas mesmo quando a rede não estiver disponível.</p>
        </div>
        <div className="trust-row">
          <div><Fingerprint /><span><strong>Acesso autenticado</strong><small>Identidade confirmada</small></span></div>
          <div><FileKey2 /><span><strong>AES‑GCM 256</strong><small>Proteção no dispositivo</small></span></div>
          <div><Wifi /><span><strong>Offline-first</strong><small>Continuidade garantida</small></span></div>
        </div>
      </section>

      <section className={`access-panel ${entering ? "is-entering" : ""}`}>
        <div className="access-card">
          <div className="mobile-brand"><Logo /></div>
          <span className="access-kicker">Selecionar ambiente</span>
          <h2>Bem-vindo ao Iago Security</h2>
          <p className="access-lead">Sua identidade já foi autenticada. Escolha a experiência que deseja abrir.</p>

          <div className="identity-chip">
            <span className="avatar avatar-blue">{initials(user.displayName)}</span>
            <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
            <CheckCircle2 />
          </div>

          <fieldset className="role-selector">
            <legend>Perfil de acesso</legend>
            <button
              type="button"
              className={role === "admin" ? "selected" : ""}
              onClick={() => setRole("admin")}
              aria-pressed={role === "admin"}
            >
              <span className="role-icon"><UserCog /></span>
              <span><strong>Administrador</strong><small>Garrido · gestão completa</small></span>
              <span className="radio-dot" />
            </button>
            <button
              type="button"
              className={role === "user" ? "selected" : ""}
              onClick={() => setRole("user")}
              aria-pressed={role === "user"}
            >
              <span className="role-icon"><UserCheck /></span>
              <span><strong>Usuário</strong><small>Renan Coutinho · mensagens recebidas</small></span>
              <span className="radio-dot" />
            </button>
          </fieldset>

          <label className="remember-row">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span>Lembrar este ambiente neste dispositivo</span>
          </label>

          <Button className="primary-action" size="lg" onClick={enter} disabled={entering}>
            {entering ? <RefreshCw className="spin" /> : <LockKeyhole />}
            {entering ? "Abrindo ambiente…" : `Acessar como ${role === "admin" ? "Administrador" : "Usuário"}`}
            {!entering && <ArrowRight />}
          </Button>

          <div className="access-footnote">
            <span><span className="live-dot" /> Sessão protegida</span>
            <span>Identidade protegida e sessão autenticada</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function IagoSecurityApp({ user, signOutPath }: { user: AuthenticatedUser; signOutPath: string }) {
  const [state, setState] = useState<AppState | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>("overview");
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const stateRef = useRef<AppState | null>(null);
  const syncMetaRef = useRef<SyncMeta>({ revision: 0, dirty: false, lastSyncedAt: null });
  const syncingRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);

  const syncNow = useCallback(async (announce = false) => {
    if (syncingRef.current || !navigator.onLine || !stateRef.current) return;
    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao consultar o cofre online.");
      const remote = (await response.json()) as { state: AppState | null; revision: number };
      let nextState = stateRef.current;
      if (remote.state && isAppState(remote.state)) {
        nextState = mergeStates(nextState, remote.state);
      }
      const needsUpload =
        syncMetaRef.current.dirty ||
        !remote.state ||
        nextState.updatedAt !== remote.state.updatedAt;
      let revision = remote.revision;
      if (needsUpload) {
        let upload = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: nextState, expectedRevision: remote.revision }),
        });
        if (upload.status === 409) {
          const conflict = (await upload.json()) as { state?: AppState; revision: number };
          if (conflict.state && isAppState(conflict.state)) nextState = mergeStates(nextState, conflict.state);
          upload = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: nextState, expectedRevision: conflict.revision }),
          });
        }
        if (!upload.ok) throw new Error("Falha ao atualizar o cofre online.");
        const uploaded = (await upload.json()) as { revision: number };
        revision = uploaded.revision;
      }
      const nextMeta = { revision, dirty: false, lastSyncedAt: new Date().toISOString() };
      stateRef.current = nextState;
      syncMetaRef.current = nextMeta;
      setState(nextState);
      await saveLocalRepository(nextState, nextMeta);
      setSyncStatus("synced");
      if (announce) toast.success("Cofre sincronizado", { description: "Todas as alterações estão atualizadas." });
    } catch (error) {
      console.error(error);
      setSyncStatus("error");
      if (announce) toast.error("Não foi possível sincronizar", { description: "Os dados permanecem protegidos neste dispositivo." });
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const repository = await loadLocalRepository();
        const initial = repository.state && isAppState(repository.state)
          ? repository.state
          : createInitialState(user);
        if (!alive) return;
        stateRef.current = initial;
        syncMetaRef.current = repository.meta;
        setState(initial);
        setLastActivityAt(Date.now());
        const remembered = localStorage.getItem("iago-security-role") as Role | null;
        if (remembered === "admin" || remembered === "user") {
          setRole(remembered);
          setView(remembered === "admin" ? "overview" : "inbox");
        }
        await saveLocalRepository(initial, {
          ...repository.meta,
          dirty: repository.state ? repository.meta.dirty : true,
        });
        syncMetaRef.current = {
          ...repository.meta,
          dirty: repository.state ? repository.meta.dirty : true,
        };
        if (navigator.onLine) void syncNow();
      } catch (error) {
        console.error(error);
        const initial = createInitialState(user);
        stateRef.current = initial;
        setState(initial);
        setSyncStatus("error");
      }
    })();
    const handleOnline = () => {
      setOnline(true);
      void syncNow(true);
    };
    const handleOffline = () => {
      setOnline(false);
      setSyncStatus("offline");
      toast.info("Modo offline ativado", { description: "Você pode continuar trabalhando normalmente." });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker", error));
    }
    return () => {
      alive = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncNow, user]);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n" && role === "admin") {
        event.preventDefault();
        setView("compose");
      }
    };
    const activityHandler = () => setLastActivityAt(Date.now());
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("pointerdown", activityHandler);
    window.addEventListener("keydown", activityHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("pointerdown", activityHandler);
      window.removeEventListener("keydown", activityHandler);
    };
  }, [role]);

  useEffect(() => {
    if (!state || !role || state.settings.autoLockMinutes <= 0 || lastActivityAt <= 0) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAt > state.settings.autoLockMinutes * 60_000) {
        setRole(null);
        localStorage.removeItem("iago-security-role");
        toast.info("Sessão bloqueada por inatividade");
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [lastActivityAt, role, state]);

  useEffect(() => {
    if (!state) return;
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.dataset.motion = state.settings.reducedMotion ? "reduced" : "full";
    document.documentElement.dataset.density = state.settings.compactMode ? "compact" : "comfortable";
  }, [state]);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "read_iago_security_status",
        title: "Consultar status do Iago Security",
        description: "Retorna conectividade, sincronização e totais atuais sem modificar dados.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => ({
          online: navigator.onLine,
          syncStatus,
          messages: stateRef.current?.messages.length ?? 0,
          collaborators: stateRef.current?.collaborators.length ?? 0,
        }),
      }, { signal: controller.signal });
      await context.registerTool({
        name: "start_secure_message_creation",
        title: "Iniciar mensagem protegida",
        description: "Abre o compositor para o administrador preencher e confirmar uma nova mensagem.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => {
          if (role !== "admin") throw new Error("O ambiente atual não possui permissão administrativa.");
          setView("compose");
          return { opened: true, view: "compose" };
        },
      }, { signal: controller.signal });
      await context.registerTool({
        name: "read_post_order_message_tree",
        title: "Consultar árvore binária pós-ordem",
        description: "Retorna a estrutura e a sequência real esquerda-direita-raiz usada para indexar as mensagens.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => {
          const messages = stateRef.current?.messages ?? [];
          const index = buildMessageTree(messages);
          return {
            nodes: index.size,
            height: index.height,
            traversal: "post-order",
            rule: ["left", "right", "root"],
            sequence: postOrderMessages(index.root).map((message, position) => ({ position: position + 1, id: message.id, title: message.title })),
          };
        },
      }, { signal: controller.signal });
    };
    void register().catch(() => undefined);
    return () => controller.abort();
  }, [role, syncStatus]);

  const commit = useCallback((updater: (current: AppState) => AppState) => {
    const current = stateRef.current;
    if (!current) return;
    const updated = updater(current);
    const next = { ...updated, updatedAt: new Date().toISOString() };
    const meta = { ...syncMetaRef.current, dirty: true };
    stateRef.current = next;
    syncMetaRef.current = meta;
    setState(next);
    setSyncStatus(navigator.onLine ? "local" : "offline");
    void saveLocalRepository(next, meta).catch(() => {
      setSyncStatus("error");
      toast.error("Falha ao salvar no cofre local");
    });
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    if (navigator.onLine) syncTimerRef.current = window.setTimeout(() => void syncNow(), 900);
  }, [syncNow]);

  if (!state) return <LoadingVault />;

  const enter = (selectedRole: Role, remember: boolean) => {
    setRole(selectedRole);
    setView(selectedRole === "admin" ? "overview" : "inbox");
    if (remember) localStorage.setItem("iago-security-role", selectedRole);
    else localStorage.removeItem("iago-security-role");
    commit((current) => ({
      ...current,
      activities: [
        activity(
          "Ambiente acessado",
          `${selectedRole === "admin" ? "Administrador" : "Usuário"} iniciou uma sessão autenticada.`,
          selectedRole === "admin" ? "Garrido" : "Renan Coutinho",
          "success",
          "session.login",
        ),
        ...current.activities,
      ],
    }));
  };

  if (!role) return <AccessGate user={user} onEnter={enter} />;

  const actor = role === "admin" ? "Garrido" : "Renan Coutinho";
  const navigation = role === "admin" ? adminNavigation : userNavigation;
  const currentLabel = navigation.find((item) => item.id === view)?.label ?? "Iago Security";
  const unreadCount = state.messages.filter((message) => {
    const status = effectiveStatus(message);
    return role === "admin"
      ? status === "waiting" || status === "expired"
      : message.recipientId === "usr-renan-coutinho" && status === "delivered";
  }).length;

  const navigate = (next: View) => {
    const allowed = navigation.some((item) => item.id === next) || (role === "admin" && next === "compose");
    if (!allowed) {
      toast.error("Acesso não autorizado", { description: "Este recurso pertence ao ambiente administrativo." });
      return;
    }
    setView(next);
    setSidebarOpen(false);
  };

  const leaveEnvironment = () => {
    localStorage.removeItem("iago-security-role");
    setRole(null);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell ${state.settings.privacyMode ? "privacy-enabled" : ""}`}>
      {!online && (
        <div className="offline-banner" role="status">
          <CloudOff /> Você está offline. As alterações serão sincronizadas quando a conexão voltar.
        </div>
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>
        <nav aria-label="Navegação principal">
          <span className="nav-caption">Workspace</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                <Icon /><span>{item.label}</span>
                {item.id === "inbox" && unreadCount > 0 && <small>{unreadCount}</small>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-security">
          <div className="security-orbit"><ShieldCheck /></div>
          <div><strong>Integridade operacional</strong><span>Proteções ativas</span></div>
          <span className="health-score">100</span>
        </div>

        <div className="sidebar-account">
          <button className="account-button" onClick={leaveEnvironment} title="Trocar ambiente">
            <span className={`avatar ${role === "admin" ? "avatar-blue" : "avatar-cyan"}`}>{initials(actor)}</span>
            <span><strong>{actor}</strong><small>{role === "admin" ? "Administrador" : "Colaborador"}</small></span>
            <ChevronDown />
          </button>
          <a className="signout-link" href={signOutPath}>Encerrar sessão autenticada</a>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu /></button>
            <div><span className="topbar-context">Iago Security</span><h1>{currentLabel}</h1></div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setCommandOpen(true)}>
              <Search /><span>Buscar ou executar…</span><kbd>⌘ K</kbd>
            </button>
            <button
              className={`sync-pill sync-${syncStatus}`}
              onClick={() => void syncNow(true)}
              title="Sincronizar agora"
            >
              {syncStatus === "syncing" ? <RefreshCw className="spin" /> : online ? <Cloud /> : <CloudOff />}
              <span>{syncStatus === "syncing" ? "Sincronizando" : online ? "Protegido" : "Offline"}</span>
            </button>
            <button className="icon-button notification-button" onClick={() => setNotificationOpen(true)} aria-label="Notificações">
              <Bell />{unreadCount > 0 && <span>{unreadCount}</span>}
            </button>
            {role === "admin" && (
              <Button className="header-primary" onClick={() => navigate("compose")}><Plus /> Nova mensagem</Button>
            )}
          </div>
        </header>

        <main className="main-content" key={`${role}-${view}`}>
          {role === "admin" && view === "overview" && <Overview state={state} onNavigate={navigate} />}
          {role === "admin" && view === "compose" && <Composer state={state} commit={commit} onDone={() => navigate("messages")} user={user} />}
          {role === "admin" && view === "messages" && <Messages state={state} commit={commit} onCompose={() => navigate("compose")} />}
          {role === "admin" && view === "binary-tree" && <Messages state={state} commit={commit} onCompose={() => navigate("compose")} treeOnly />}
          {role === "admin" && view === "collaborators" && <Collaborators state={state} commit={commit} />}
          {view === "activity" && <ActivityLog state={state} role={role} />}
          {view === "settings" && (
            <SettingsView
              state={state}
              commit={commit}
              syncStatus={syncStatus}
              online={online}
              onSync={() => void syncNow(true)}
            />
          )}
          {role === "user" && view === "inbox" && <UserInbox state={state} commit={commit} />}
        </main>

        <nav className="mobile-nav" aria-label="Navegação móvel">
          {navigation.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon /><span>{item.label}</span></button>;
          })}
        </nav>
      </div>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} title="Central de comandos" description="Navegue e execute ações no Iago Security">
        <CommandInput placeholder="Digite uma página ou ação…" />
        <CommandList>
          <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
          <CommandGroup heading="Navegação">
            {navigation.map((item) => {
              const Icon = item.icon;
              return <CommandItem key={item.id} onSelect={() => { navigate(item.id); setCommandOpen(false); }}><Icon />{item.label}</CommandItem>;
            })}
          </CommandGroup>
          <CommandGroup heading="Ações rápidas">
            {role === "admin" && <CommandItem onSelect={() => { navigate("compose"); setCommandOpen(false); }}><Plus />Criar mensagem protegida<CommandShortcut>⌘N</CommandShortcut></CommandItem>}
            <CommandItem onSelect={() => { void syncNow(true); setCommandOpen(false); }}><RefreshCw />Sincronizar agora</CommandItem>
            <CommandItem onSelect={() => { leaveEnvironment(); setCommandOpen(false); }}><Lock />Bloquear e trocar ambiente</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
        <DialogContent className="cipher-dialog notifications-dialog">
          <DialogHeader><DialogTitle>Central de atenção</DialogTitle><DialogDescription>Eventos que merecem uma decisão.</DialogDescription></DialogHeader>
          <div className="notification-list">
            {unreadCount === 0 ? (
              <EmptyState icon={CheckCircle2} title="Tudo sob controle" description="Nenhum evento precisa da sua atenção agora." />
            ) : state.messages.filter((message) => {
              const status = effectiveStatus(message);
              return role === "admin" ? ["waiting", "expired"].includes(status) : message.recipientId === "usr-renan-coutinho" && status === "delivered";
            }).slice(0, 6).map((message) => (
              <button key={message.id} onClick={() => { navigate(role === "admin" ? "messages" : "inbox"); setNotificationOpen(false); }}>
                <span className={`notice-icon notice-${effectiveStatus(message)}`}><AlertTriangle /></span>
                <span><strong>{message.title}</strong><small>{effectiveStatus(message) === "expired" ? "O acesso expirou" : `Expira ${relativeDate(message.expiresAt)}`}</small></span>
                <ArrowRight />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Toaster position="bottom-right" closeButton />
    </div>
  );
}

function Overview({ state, onNavigate }: { state: AppState; onNavigate: (view: View) => void }) {
  const referenceTime = new Date(state.updatedAt).getTime();
  const activeMessages = state.messages.map((message) => ({ ...message, status: effectiveStatus(message) }));
  const counts = {
    total: activeMessages.length,
    delivered: activeMessages.filter((message) => message.status === "delivered").length,
    revealed: activeMessages.filter((message) => message.status === "revealed").length,
    waiting: activeMessages.filter((message) => message.status === "waiting").length,
    expired: activeMessages.filter((message) => message.status === "expired").length,
  };
  const attention = activeMessages
    .filter((message) => message.status === "expired" || (new Date(message.expiresAt).getTime() - referenceTime < 3 * 86_400_000 && !["revealed", "revoked"].includes(message.status)))
    .slice(0, 4);
  const flow = (["waiting", "delivered", "revealed", "expired"] as MessageStatus[]).map((status) => ({
    status,
    count: activeMessages.filter((message) => message.status === status).length,
  }));
  const max = Math.max(1, ...flow.map((item) => item.count));

  return (
    <div className="page-stack overview-page">
      <section className="page-intro overview-intro">
        <div>
          <span className="eyebrow"><Sparkles /> {weekdayDate(state.updatedAt)}</span>
          <h2>Boa noite, Garrido.</h2>
          <p>Seu ambiente está íntegro. Há {counts.waiting + counts.delivered} mensagens em trânsito seguro.</p>
        </div>
        <Button className="secondary-action" onClick={() => onNavigate("activity")}><History /> Ver histórico</Button>
      </section>

      <section className="overview-grid">
        <article className="integrity-card">
          <div className="integrity-copy">
            <span className="card-label">Postura de segurança</span>
            <h3>Ambiente íntegro</h3>
            <p>Criptografia, persistência local e verificação de arquivos estão ativas.</p>
            <div className="integrity-checks">
              <span><Check /> Cofre local disponível</span>
              <span><Check /> Assinaturas verificadas</span>
              <span><Check /> Sessão autenticada</span>
            </div>
          </div>
          <div className="score-orbit" aria-label="Índice de integridade: 100 de 100">
            <svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="62" /><circle className="score-progress" cx="75" cy="75" r="62" /></svg>
            <span><strong>100</strong><small>/ 100</small></span>
          </div>
        </article>

        <article className="overview-summary">
          <div className="summary-head"><span className="card-label">Operação hoje</span><Gauge /></div>
          <strong className="large-number">{counts.total}</strong>
          <span className="large-caption">mensagens no cofre</span>
          <div className="mini-stats">
            <div><span className="mini-dot cyan" /><strong>{counts.delivered}</strong><small>Entregues</small></div>
            <div><span className="mini-dot green" /><strong>{counts.revealed}</strong><small>Reveladas</small></div>
            <div><span className="mini-dot amber" /><strong>{counts.waiting}</strong><small>Aguardando</small></div>
          </div>
        </article>
      </section>

      <section className="metric-row">
        <article><span className="metric-icon blue"><MessageSquareLock /></span><div><small>Total protegido</small><strong>{counts.total}</strong><em>+{Math.min(3, counts.total)} este período</em></div></article>
        <article><span className="metric-icon cyan"><FileCheck2 /></span><div><small>Entregues</small><strong>{counts.delivered}</strong><em>Prontas para leitura</em></div></article>
        <article><span className="metric-icon green"><Eye /></span><div><small>Reveladas</small><strong>{counts.revealed}</strong><em>Com rastreabilidade</em></div></article>
        <article><span className="metric-icon amber"><Users /></span><div><small>Colaboradores</small><strong>{state.collaborators.filter((person) => person.status === "active").length}</strong><em>Ativos agora</em></div></article>
      </section>

      <section className="dashboard-columns">
        <article className="surface flow-card">
          <div className="surface-head"><div><span className="card-label">Fluxo de mensagens</span><h3>Distribuição por status</h3></div><button onClick={() => onNavigate("messages")}>Ver todas <ArrowRight /></button></div>
          <div className="flow-list">
            {flow.map((item) => (
              <div key={item.status}>
                <div><StatusBadge status={item.status} /><strong>{item.count}</strong></div>
                <span className="flow-track"><span className={`flow-fill status-${item.status}`} style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} /></span>
              </div>
            ))}
          </div>
        </article>
        <article className="surface attention-card">
          <div className="surface-head"><div><span className="card-label">Atenção necessária</span><h3>Próximas decisões</h3></div><span className="attention-count">{attention.length}</span></div>
          <div className="attention-list">
            {attention.length === 0 ? <EmptyState icon={CheckCircle2} title="Sem pendências" description="Nenhuma mensagem precisa de intervenção." /> : attention.map((message) => (
              <button key={message.id} onClick={() => onNavigate("messages")}>
                <span className={`notice-icon notice-${message.status}`}><AlertTriangle /></span>
                <span><strong>{message.title}</strong><small>{message.status === "expired" ? "Acesso expirado" : `Expira ${relativeDate(message.expiresAt)}`}</small></span>
                <ArrowRight />
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="surface recent-card">
        <div className="surface-head"><div><span className="card-label">Registro vivo</span><h3>Atividade recente</h3></div><button onClick={() => onNavigate("activity")}>Abrir trilha completa <ArrowRight /></button></div>
        <div className="recent-activity">
          {state.activities.slice(0, 5).map((entry) => (
            <div key={entry.id}>
              <span className={`activity-symbol severity-${entry.severity}`}>{entry.severity === "success" ? <Check /> : entry.severity === "warning" ? <AlertTriangle /> : <ActivityIcon />}</span>
              <span><strong>{entry.title}</strong><small>{entry.detail}</small></span>
              <time>{relativeDate(entry.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type ComposeDraft = {
  title: string;
  content: string;
  recipientId: string;
  priority: Priority;
  expiresAt: string;
  oneTime: boolean;
  requiresAck: boolean;
  note: string;
  accessCode: string;
};

function Composer({ state, commit, onDone, user }: { state: AppState; commit: (updater: (state: AppState) => AppState) => void; onDone: () => void; user: AuthenticatedUser }) {
  const activePeople = state.collaborators.filter((person) => person.status === "active");
  const [step, setStep] = useState(1);
  const [working, setWorking] = useState(false);
  const [created, setCreated] = useState<ProtectedMessage | null>(null);
  const [draft, setDraft] = useState<ComposeDraft>({
    title: "",
    content: "",
    recipientId: activePeople[0]?.id ?? "",
    priority: "normal",
    expiresAt: localDateTime(7),
    oneTime: false,
    requiresAck: true,
    note: "",
    accessCode: "",
  });
  const recipient = state.collaborators.find((person) => person.id === draft.recipientId);
  const steps = ["Conteúdo", "Destinatário", "Segurança", "Revisão"];

  const validateStep = () => {
    if (step === 1 && (draft.title.trim().length < 3 || draft.content.trim().length < 5)) {
      toast.error("Complete o título e o conteúdo antes de continuar.");
      return false;
    }
    if (step === 2 && !recipient) {
      toast.error("Selecione um destinatário ativo.");
      return false;
    }
    if (step === 3) {
      if (new Date(draft.expiresAt).getTime() <= Date.now()) {
        toast.error("A expiração precisa estar no futuro.");
        return false;
      }
      if (draft.accessCode.length < 8) {
        toast.error("O código de acesso precisa ter ao menos 8 caracteres.");
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (validateStep()) setStep((current) => Math.min(4, current + 1));
  };

  const saveDraft = () => {
    if (!draft.title.trim()) return toast.error("Dê um título ao rascunho.");
    const target = recipient ?? activePeople[0];
    if (!target) return toast.error("Cadastre um colaborador antes de salvar.");
    const now = new Date().toISOString();
    const message: ProtectedMessage = {
      id: createId(), title: draft.title.trim(), senderName: "Garrido", senderEmail: user.email,
      recipientId: target.id, recipientName: target.name, recipientEmail: target.email, priority: draft.priority,
      status: "draft", createdAt: now, updatedAt: now, expiresAt: new Date(draft.expiresAt).toISOString(),
      oneTime: draft.oneTime, requiresAck: draft.requiresAck, note: draft.note.trim(), draftContent: draft.content,
    };
    commit((current) => ({ ...current, messages: [message, ...current.messages], activities: [activity("Rascunho salvo", `${message.title} foi salvo somente no cofre.`, "Garrido", "info", "message.draft", message.id), ...current.activities] }));
    toast.success("Rascunho salvo no cofre");
  };

  const createProtected = async () => {
    if (!recipient || !validateStep()) return;
    setWorking(true);
    try {
      const now = new Date().toISOString();
      const base: ProtectedMessage = {
        id: createId(), title: draft.title.trim(), senderName: "Garrido", senderEmail: user.email,
        recipientId: recipient.id, recipientName: recipient.name, recipientEmail: recipient.email, priority: draft.priority,
        status: "waiting", createdAt: now, updatedAt: now, expiresAt: new Date(draft.expiresAt).toISOString(),
        oneTime: draft.oneTime, requiresAck: draft.requiresAck, note: draft.note.trim(),
      };
      const message = await protectMessage(base, draft.content, draft.accessCode);
      commit((current) => ({
        ...current,
        messages: [message, ...current.messages],
        activities: [activity("Mensagem protegida criada", `${message.title} foi protegida com AES-GCM para ${recipient.name}.`, "Garrido", "success", "message.created", message.id), ...current.activities],
      }));
      setCreated(message);
      toast.success("Mensagem protegida com sucesso", { description: "O código não foi armazenado pelo Iago Security." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível proteger a mensagem.");
    } finally {
      setWorking(false);
    }
  };

  const createSample = async () => {
    const lucas = state.collaborators.find((person) => person.id === "usr-renan-coutinho");
    if (!lucas) return;
    setWorking(true);
    try {
      const now = new Date().toISOString();
      const base: ProtectedMessage = {
        id: createId(), title: "Mensagem de validação Iago Security", senderName: "Garrido", senderEmail: user.email,
        recipientId: lucas.id, recipientName: lucas.name, recipientEmail: lucas.email, priority: "high", status: "waiting",
        createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), oneTime: false,
        requiresAck: true, note: "Arquivo gerado para validar o fluxo completo do projeto.",
      };
      const message = await protectMessage(base, "Esta mensagem foi criptografada de verdade no seu navegador. Se você consegue ler isto, a exportação, a validação de integridade e a descriptografia funcionaram corretamente.", "RENAN-2026");
      commit((current) => ({ ...current, messages: [message, ...current.messages], activities: [activity("Arquivo de validação gerado", "Uma mensagem funcional foi criada para Renan Coutinho.", "Garrido", "success", "message.sample", message.id), ...current.activities] }));
      downloadEnvelope(message);
      toast.success("Arquivo funcional baixado", { description: "Abra como Renan Coutinho usando o código RENAN-2026." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar o arquivo.");
    } finally { setWorking(false); }
  };

  if (created) {
    return (
      <div className="page-stack compact-page">
        <section className="completion-card">
          <div className="success-ripple"><ShieldCheck /></div>
          <span className="eyebrow">Proteção concluída</span>
          <h2>Mensagem pronta para transporte.</h2>
          <p>O conteúdo foi cifrado no dispositivo. O código de acesso não foi armazenado e deve ser entregue ao destinatário por um canal separado.</p>
          <div className="completion-summary">
            <div><small>Destinatário</small><strong>{created.recipientName}</strong></div>
            <div><small>Expiração</small><strong>{formatDate(created.expiresAt)}</strong></div>
            <div><small>Integridade</small><strong className="verified"><CheckCircle2 /> Verificada</strong></div>
            <div><small>Rastreamento</small><button onClick={() => { void navigator.clipboard.writeText(created.id); toast.success("Código copiado"); }}><code>{created.id.slice(0, 12)}</code><Copy /></button></div>
          </div>
          <div className="completion-actions">
            <Button className="primary-action" onClick={() => { downloadEnvelope(created); commit((current) => ({ ...current, messages: current.messages.map((message) => message.id === created.id ? { ...message, exportedAt: new Date().toISOString(), status: "waiting", updatedAt: new Date().toISOString() } : message), activities: [activity("Arquivo protegido exportado", `${created.title} foi exportada como .securemsg.`, "Garrido", "success", "message.exported", created.id), ...current.activities] })); }}><Download /> Baixar .securemsg</Button>
            <Button className="secondary-action" onClick={onDone}>Ver mensagens <ArrowRight /></Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack compose-page">
      <section className="page-intro">
        <div><span className="eyebrow"><LockKeyhole /> Compositor protegido</span><h2>Nova mensagem</h2><p>O conteúdo só deixa o dispositivo depois de ser cifrado.</p></div>
        <div className="intro-actions"><Button className="ghost-action" onClick={() => void createSample()} disabled={working}><Zap /> Baixar teste funcional</Button><Button className="secondary-action" onClick={saveDraft}><Archive /> Salvar rascunho</Button></div>
      </section>

      <div className="composer-layout">
        <section className="surface composer-main">
          <div className="stepper" aria-label={`Etapa ${step} de 4`}>
            {steps.map((label, index) => {
              const number = index + 1;
              return <button key={label} className={number === step ? "active" : number < step ? "done" : ""} onClick={() => number < step && setStep(number)} disabled={number > step}><span>{number < step ? <Check /> : number}</span><small>{label}</small></button>;
            })}
          </div>

          <div className="compose-form">
            {step === 1 && (
              <div className="form-stage stage-enter">
                <span className="stage-number">01 — Conteúdo</span><h3>O que precisa ser protegido?</h3><p>Use um título identificável. O corpo será cifrado antes da exportação.</p>
                <label className="field"><span>Título da mensagem</span><Input autoFocus value={draft.title} maxLength={100} placeholder="Ex.: Diretrizes de acesso — Q4" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><small>{draft.title.length}/100</small></label>
                <label className="field"><span>Conteúdo confidencial</span><Textarea className="message-textarea" value={draft.content} maxLength={5000} placeholder="Digite a informação que somente o destinatário poderá revelar…" onChange={(event) => setDraft({ ...draft, content: event.target.value })} /><small>{draft.content.length}/5000 caracteres</small></label>
              </div>
            )}
            {step === 2 && (
              <div className="form-stage stage-enter">
                <span className="stage-number">02 — Destinatário</span><h3>Quem poderá abrir?</h3><p>A identidade escolhida fica vinculada à assinatura do arquivo.</p>
                <div className="recipient-grid">
                  {activePeople.map((person) => <button type="button" key={person.id} className={draft.recipientId === person.id ? "selected" : ""} onClick={() => setDraft({ ...draft, recipientId: person.id })}><span className="avatar avatar-cyan">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.jobTitle}</small><em>{person.email}</em></span><span className="radio-dot" /></button>)}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="form-stage stage-enter">
                <span className="stage-number">03 — Segurança</span><h3>Defina a política de acesso.</h3><p>O código é usado para derivar a chave AES e nunca será armazenado.</p>
                <div className="form-grid">
                  <label className="field"><span>Prioridade</span><NativeSelect className="full-select" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><NativeSelectOption value="low">Baixa</NativeSelectOption><NativeSelectOption value="normal">Normal</NativeSelectOption><NativeSelectOption value="high">Alta</NativeSelectOption><NativeSelectOption value="critical">Crítica</NativeSelectOption></NativeSelect></label>
                  <label className="field"><span>Data e hora de expiração</span><Input type="datetime-local" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /></label>
                </div>
                <label className="field"><span>Código de acesso do destinatário</span><Input type="password" autoComplete="new-password" value={draft.accessCode} placeholder="No mínimo 8 caracteres" onChange={(event) => setDraft({ ...draft, accessCode: event.target.value })} /><small>Compartilhe por outro canal. O Iago Security não consegue recuperar esse código.</small></label>
                <label className="field"><span>Observação visível antes da abertura</span><Input value={draft.note} maxLength={180} placeholder="Opcional" onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
                <div className="policy-list">
                  <label><span><strong>Permitir apenas uma revelação</strong><small>Após a primeira abertura, o conteúdo não poderá ser reaberto neste cofre.</small></span><Switch checked={draft.oneTime} onCheckedChange={(checked) => setDraft({ ...draft, oneTime: checked })} /></label>
                  <label><span><strong>Exigir confirmação de leitura</strong><small>O destinatário precisará confirmar que leu o conteúdo.</small></span><Switch checked={draft.requiresAck} onCheckedChange={(checked) => setDraft({ ...draft, requiresAck: checked })} /></label>
                </div>
              </div>
            )}
            {step === 4 && recipient && (
              <div className="form-stage stage-enter review-stage">
                <span className="stage-number">04 — Revisão</span><h3>Confirme antes de proteger.</h3><p>Depois da proteção, o conteúdo não poderá ser recuperado sem o código.</p>
                <div className="review-block sensitive-content"><small>Título</small><strong>{draft.title}</strong><p>{draft.content}</p></div>
                <div className="review-grid"><div><small>Destinatário</small><span className="person-inline"><span className="avatar avatar-cyan">{initials(recipient.name)}</span><strong>{recipient.name}</strong></span></div><div><small>Prioridade</small><PriorityBadge priority={draft.priority} /></div><div><small>Expiração</small><strong>{formatDate(new Date(draft.expiresAt).toISOString())}</strong></div><div><small>Política</small><strong>{draft.oneTime ? "Uma revelação" : "Leitura contínua"}</strong></div></div>
                <div className="crypto-note"><Fingerprint /><span><strong>AES‑GCM com chave de 256 bits</strong><small>PBKDF2 SHA‑256 · 250.000 iterações · IV e salt aleatórios</small></span></div>
              </div>
            )}
          </div>

          <div className="composer-footer">
            <Button className="ghost-action" disabled={step === 1 || working} onClick={() => setStep((current) => current - 1)}><ArrowLeft /> Voltar</Button>
            {step < 4 ? <Button className="primary-action" onClick={next}>Continuar <ArrowRight /></Button> : <Button className="primary-action" onClick={() => void createProtected()} disabled={working}>{working ? <RefreshCw className="spin" /> : <ShieldCheck />}{working ? "Protegendo…" : "Proteger mensagem"}</Button>}
          </div>
        </section>

        <aside className="compose-side">
          <article className="surface live-preview"><span className="card-label">Prévia segura</span><div className="preview-envelope"><div className="preview-seal"><Shield /></div><span className="preview-priority"><PriorityBadge priority={draft.priority} /></span><h4>{draft.title || "Mensagem sem título"}</h4><p>Conteúdo protegido para</p><strong>{recipient?.name ?? "Escolha um destinatário"}</strong><div className="preview-meta"><span><Lock /> AES‑GCM</span><span><History /> {relativeDate(new Date(draft.expiresAt).toISOString())}</span></div></div></article>
          <article className="side-tip"><KeyRound /><div><strong>O código é insubstituível</strong><p>Se ele for perdido, nem o administrador poderá revelar o conteúdo cifrado.</p></div></article>
        </aside>
      </div>
    </div>
  );
}

function BinaryTreeNodeView({
  node,
  path,
  matches,
  postOrder,
  traversed,
  current,
  onHover,
  onSelect,
  depth = 0,
}: {
  node: MessageTreeNode;
  path: Set<string>;
  matches: Set<string>;
  postOrder: Map<string, number>;
  traversed: Set<string>;
  current: string | null;
  onHover: (id: string | null) => void;
  onSelect: (message: ProtectedMessage) => void;
  depth?: number;
}) {
  const hasChildren = Boolean(node.left || node.right);
  return (
    <div className="binary-branch">
      <button
        type="button"
        className={`binary-node ${path.has(node.message.id) ? "is-path" : ""} ${matches.has(node.message.id) ? "is-match" : ""}`}
        onClick={() => onSelect(node.message)}
        onMouseEnter={() => onHover(node.message.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(node.message.id)}
        onBlur={() => onHover(null)}
        title={`Abrir ${node.message.title}`}
        data-traversed={traversed.has(node.message.id) ? "true" : undefined}
        data-current={current === node.message.id ? "true" : undefined}
      >
        <span>{depth === 0 ? "Raiz" : "Nó"} · visita {postOrder.get(node.message.id)}</span>
        <strong>{node.message.title}</strong>
        <small>{node.message.id.slice(0, 6).toUpperCase()}</small>
        <em className="binary-node-tip">Visita {postOrder.get(node.message.id)} · esquerda → direita → raiz</em>
      </button>
      {hasChildren && depth < 4 && (
        <div className="binary-children">
          <div className={node.left ? "has-node" : "is-empty"}>
            {node.left ? <BinaryTreeNodeView node={node.left} path={path} matches={matches} postOrder={postOrder} traversed={traversed} current={current} onHover={onHover} onSelect={onSelect} depth={depth + 1} /> : <span className="binary-empty">∅</span>}
          </div>
          <div className={node.right ? "has-node" : "is-empty"}>
            {node.right ? <BinaryTreeNodeView node={node.right} path={path} matches={matches} postOrder={postOrder} traversed={traversed} current={current} onHover={onHover} onSelect={onSelect} depth={depth + 1} /> : <span className="binary-empty">∅</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Messages({ state, commit, onCompose, treeOnly = false }: { state: AppState; commit: (updater: (state: AppState) => AppState) => void; onCompose: () => void; treeOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | MessageStatus>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [selected, setSelected] = useState<ProtectedMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProtectedMessage | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const effectiveMessages = useMemo(() => state.messages.map((message) => ({ ...message, status: effectiveStatus(message) })), [state.messages]);
  const tree = useMemo(() => buildMessageTree(effectiveMessages), [effectiveMessages]);
  const postOrder = useMemo(() => postOrderMessages(tree.root), [tree.root]);
  const postOrderMap = useMemo(() => new Map(postOrder.map((message, index) => [message.id, index + 1])), [postOrder]);
  const treeLookup = useMemo(() => searchTitlePrefix(tree.root, query), [query, tree.root]);
  const messages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return effectiveMessages
      .filter((message) => !normalizedQuery || `${message.title} ${message.recipientName} ${message.recipientEmail}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
      .filter((message) => status === "all" || message.status === status)
      .filter((message) => priority === "all" || message.priority === priority)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [effectiveMessages, priority, query, status]);
  const pathIds = useMemo(() => new Set(treeLookup.path), [treeLookup.path]);
  const matchIds = useMemo(() => new Set(treeLookup.matches.map((message) => message.id)), [treeLookup.matches]);
  const hoveredPosition = hoveredNode ? postOrderMap.get(hoveredNode) ?? 0 : 0;
  const traversedIds = useMemo(() => new Set(postOrder.slice(0, hoveredPosition).map((message) => message.id)), [hoveredPosition, postOrder]);

  const revoke = (message: ProtectedMessage) => {
    commit((current) => ({ ...current, messages: current.messages.map((item) => item.id === message.id ? { ...item, status: "revoked", updatedAt: new Date().toISOString() } : item), activities: [activity("Acesso revogado", `${message.title} foi revogada pelo administrador.`, "Garrido", "warning", "message.revoked", message.id), ...current.activities] }));
    setSelected(null); toast.success("Acesso revogado");
  };
  const removeMessage = () => {
    if (!deleteTarget) return;
    const message = deleteTarget;
    commit((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== message.id), activities: [activity("Mensagem excluída", `${message.title} foi excluída permanentemente pelo administrador.`, "Garrido", "warning", "message.deleted", message.id), ...current.activities] }));
    setDeleteTarget(null);
    setSelected(null);
    toast.success("Mensagem excluída do cofre");
  };

  return (
    <div className="page-stack">
      <section className="page-intro"><div><span className="eyebrow">{treeOnly ? <GitBranch /> : <Inbox />} {treeOnly ? "Estrutura de dados" : "Cofre de mensagens"}</span><h2>{treeOnly ? "Árvore pós‑ordem" : "Mensagens"}</h2><p>{treeOnly ? "Veja exatamente onde e como a árvore binária é usada no sistema." : "Acompanhe o ciclo completo, da criação à revelação."}</p></div><Button className="primary-action" onClick={onCompose}><Plus /> Nova mensagem</Button></section>
      {treeOnly && <section className="surface binary-index">
        <div className="binary-head">
          <div className="binary-title"><span className="binary-icon"><GitBranch /></span><div><span className="card-label">Estrutura de dados ativa</span><h3>Árvore binária balanceada · pós‑ordem</h3><p>Os nós são visitados na sequência esquerda → direita → raiz. A busca por título percorre os ramos da estrutura.</p></div></div>
          <div className="binary-metrics"><span><strong>{tree.size}</strong><small>Nós</small></span><span><strong>{tree.height}</strong><small>Altura</small></span><span><strong>{query ? treeLookup.comparisons : 0}</strong><small>Comparações</small></span></div>
        </div>
        <div className="binary-legend"><span><i className="legend-root" /> Número da visita pós‑ordem</span><span><i className="legend-path" /> Caminho da busca</span><span><i className="legend-match" /> Resultado encontrado</span></div>
        <label className="tree-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite o início do título para visualizar a busca" /></label>
        <div className="binary-canvas" aria-label="Representação visual da árvore binária de mensagens">
          {tree.root ? <BinaryTreeNodeView node={tree.root} path={pathIds} matches={query ? matchIds : new Set()} postOrder={postOrderMap} traversed={traversedIds} current={hoveredNode} onHover={setHoveredNode} onSelect={setSelected} /> : <EmptyState icon={GitBranch} title="Árvore vazia" description="Crie a primeira mensagem para gerar o nó raiz." />}
        </div>
        {hoveredNode && <div className="binary-live" aria-live="polite"><GitBranch /><span><strong>Percurso até a visita {hoveredPosition}</strong><small>{postOrder.slice(0, hoveredPosition).map((message) => message.title).join(" → ")}</small></span></div>}
        {postOrder.length > 0 && <div className="binary-sequence"><strong>Pós‑ordem</strong>{postOrder.map((message, index) => <span key={message.id} className={hoveredPosition && index < hoveredPosition ? (index + 1 === hoveredPosition ? "is-current" : "is-visited") : ""}><i>{index + 1}</i>{message.title}{index < postOrder.length - 1 && <ArrowRight />}</span>)}</div>}
        <p className="binary-note">Passe o mouse ou use Tab sobre cada nó para visualizar o percurso até ele. Clique para abrir a mensagem.</p>
      </section>}
      {!treeOnly && <section className="surface data-surface">
        <div className="table-toolbar">
          <label className="table-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título ou destinatário" /></label>
          <div className="table-filters"><NativeSelect value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><NativeSelectOption value="all">Todos os status</NativeSelectOption>{Object.entries(statusLabel).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect><NativeSelect value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><NativeSelectOption value="all">Todas as prioridades</NativeSelectOption>{Object.entries(priorityLabel).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></div>
        </div>
        {messages.length === 0 ? <EmptyState icon={Search} title="Nenhuma mensagem encontrada" description="Ajuste os filtros ou crie uma nova mensagem protegida." action={<Button className="secondary-action" onClick={onCompose}><Plus /> Criar mensagem</Button>} /> : (
          <div className="responsive-table">
            <table><thead><tr><th>Mensagem</th><th>Destinatário</th><th>Prioridade</th><th>Expiração</th><th>Status</th><th aria-label="Ações" /></tr></thead><tbody>{messages.map((message) => <tr key={message.id} onClick={() => setSelected(message)}><td data-label="Mensagem"><div className="message-cell"><span className="file-icon"><FileKey2 /></span><span><strong>{message.title}</strong><small>{message.id.slice(0, 8).toUpperCase()} · {formatDate(message.createdAt)}</small></span></div></td><td data-label="Destinatário"><span className="person-inline"><span className="avatar avatar-small">{initials(message.recipientName)}</span><span><strong>{message.recipientName}</strong><small>{message.recipientEmail}</small></span></span></td><td data-label="Prioridade"><PriorityBadge priority={message.priority} /></td><td data-label="Expiração"><strong>{relativeDate(message.expiresAt)}</strong><small>{formatDate(message.expiresAt)}</small></td><td data-label="Status"><StatusBadge status={message.status} /></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); setSelected(message); }} aria-label={`Ações para ${message.title}`}><MoreHorizontal /></button></td></tr>)}</tbody></table>
          </div>
        )}
        <div className="table-footer"><span>{messages.length} de {state.messages.length} mensagens</span><span>Ordenadas pela atualização mais recente</span></div>
      </section>}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="cipher-dialog detail-dialog">
          {selected && <><DialogHeader><div className="dialog-icon"><FileKey2 /></div><DialogTitle>{selected.title}</DialogTitle><DialogDescription>Código {selected.id}</DialogDescription></DialogHeader><div className="message-detail-grid"><div><small>Status</small><StatusBadge status={effectiveStatus(selected)} /></div><div><small>Prioridade</small><PriorityBadge priority={selected.priority} /></div><div><small>Destinatário</small><strong>{selected.recipientName}</strong><span>{selected.recipientEmail}</span></div><div><small>Expiração</small><strong>{formatDate(selected.expiresAt)}</strong><span>{relativeDate(selected.expiresAt)}</span></div><div><small>Política</small><strong>{selected.oneTime ? "Revelação única" : "Acesso contínuo"}</strong><span>{selected.requiresAck ? "Confirmação obrigatória" : "Sem confirmação"}</span></div><div><small>Integridade</small><strong className={selected.integrityHash ? "verified" : "muted"}>{selected.integrityHash ? <><CheckCircle2 /> Assinada</> : "Somente histórico"}</strong></div>{treeOnly && <div><small>Árvore binária</small><strong className="verified"><GitBranch /> Visita {postOrderMap.get(selected.id) ?? "—"}</strong><span>Percurso pós‑ordem</span></div>}</div>{selected.note && <div className="detail-note"><small>Observação</small><p>{selected.note}</p></div>}<DialogFooter><Button className="ghost-action" onClick={() => { void navigator.clipboard.writeText(selected.id); toast.success("Código copiado"); }}><Copy /> Copiar ID</Button>{selected.encryptedPayload && <Button className="secondary-action" onClick={() => { downloadEnvelope(selected); toast.success("Arquivo baixado"); }}><Download /> Exportar</Button>}{!["draft", "revoked", "expired"].includes(effectiveStatus(selected)) && <Button variant="destructive" onClick={() => revoke(selected)}><ShieldAlert /> Revogar</Button>}<Button variant="destructive" onClick={() => { setDeleteTarget(selected); setSelected(null); }}><Trash2 /> Excluir mensagem</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="cipher-dialog">
          {deleteTarget && <><DialogHeader><div className="dialog-icon danger"><Trash2 /></div><DialogTitle>Excluir mensagem permanentemente?</DialogTitle><DialogDescription>Esta ação remove a mensagem do cofre local e da sincronização. Ela não poderá ser desfeita.</DialogDescription></DialogHeader><div className="detail-note"><small>Mensagem selecionada</small><p><strong>{deleteTarget.title}</strong><br />Destinatário: {deleteTarget.recipientName}</p></div><DialogFooter><Button className="ghost-action" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" onClick={removeMessage}><Trash2 /> Confirmar exclusão</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Collaborators({ state, commit }: { state: AppState; commit: (updater: (state: AppState) => AppState) => void }) {
  const emptyPerson = { name: "", email: "", department: "", jobTitle: "" };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [form, setForm] = useState(emptyPerson);
  const filtered = state.collaborators.filter((person) => `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(query.toLowerCase()));
  const startAdd = () => { setEditing(null); setForm(emptyPerson); setOpen(true); };
  const startEdit = (person: Collaborator) => { setEditing(person); setForm({ name: person.name, email: person.email, department: person.department, jobTitle: person.jobTitle }); setOpen(true); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 3 || !/^\S+@\S+\.\S+$/.test(form.email)) return toast.error("Informe nome e e-mail válidos.");
    const duplicate = state.collaborators.some((person) => person.email.toLowerCase() === form.email.toLowerCase() && person.id !== editing?.id);
    if (duplicate) return toast.error("Já existe um colaborador com este e-mail.");
    const now = new Date().toISOString();
    const person: Collaborator = editing ? { ...editing, ...form, updatedAt: now } : { id: createId(), ...form, status: "active", lastActive: now, createdAt: now, updatedAt: now };
    commit((current) => ({ ...current, collaborators: editing ? current.collaborators.map((item) => item.id === editing.id ? person : item) : [person, ...current.collaborators], activities: [activity(editing ? "Colaborador atualizado" : "Colaborador adicionado", `${person.name} foi ${editing ? "atualizado" : "adicionado"} na equipe.`, "Garrido", "success", editing ? "collaborator.updated" : "collaborator.created"), ...current.activities] }));
    setOpen(false); toast.success(editing ? "Cadastro atualizado" : "Colaborador adicionado");
  };
  const toggle = (person: Collaborator) => {
    const nextStatus = person.status === "active" ? "inactive" : "active";
    const related = state.messages.filter((message) => message.recipientId === person.id && !["revealed", "expired", "revoked"].includes(effectiveStatus(message))).length;
    if (nextStatus === "inactive" && related > 0 && !confirm(`${person.name} possui ${related} mensagem(ns) pendente(s). Deseja desativar mesmo assim?`)) return;
    commit((current) => ({ ...current, collaborators: current.collaborators.map((item) => item.id === person.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item), activities: [activity(`Colaborador ${nextStatus === "active" ? "ativado" : "desativado"}`, `${person.name} teve o acesso ${nextStatus === "active" ? "restaurado" : "suspenso"}.`, "Garrido", nextStatus === "active" ? "success" : "warning", "collaborator.status"), ...current.activities] }));
    toast.success(`Colaborador ${nextStatus === "active" ? "ativado" : "desativado"}`);
  };
  return (
    <div className="page-stack"><section className="page-intro"><div><span className="eyebrow"><Users /> Diretório protegido</span><h2>Colaboradores</h2><p>Gerencie identidades autorizadas a receber arquivos protegidos.</p></div><Button className="primary-action" onClick={startAdd}><Plus /> Novo colaborador</Button></section><section className="surface data-surface"><div className="table-toolbar"><label className="table-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, e-mail ou área" /></label><span className="directory-count"><span className="live-dot" /> {state.collaborators.filter((person) => person.status === "active").length} ativos</span></div><div className="people-grid">{filtered.map((person) => { const related = state.messages.filter((message) => message.recipientId === person.id).length; return <article key={person.id} className={person.status === "inactive" ? "inactive" : ""}><div className="person-card-head"><span className="avatar avatar-large">{initials(person.name)}</span><span className={`person-state ${person.status}`}><span />{person.status === "active" ? "Ativo" : "Inativo"}</span></div><h3>{person.name}</h3><p>{person.jobTitle}</p><small>{person.department} · {person.email}</small><div className="person-card-stats"><span><strong>{related}</strong><small>mensagens</small></span><span><strong>{relativeDate(person.lastActive)}</strong><small>última atividade</small></span></div><div className="person-card-actions"><Button className="ghost-action" onClick={() => startEdit(person)}>Editar</Button><Button className="secondary-action" onClick={() => toggle(person)}>{person.status === "active" ? "Desativar" : "Ativar"}</Button></div></article>; })}</div></section>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="cipher-dialog"><DialogHeader><DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle><DialogDescription>{editing ? "Atualize os dados da identidade selecionada." : "Cadastre uma identidade para receber mensagens."}</DialogDescription></DialogHeader><form onSubmit={submit} className="dialog-form"><label className="field"><span>Nome completo</span><Input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="field"><span>E-mail</span><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><div className="form-grid"><label className="field"><span>Área</span><Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label><label className="field"><span>Cargo</span><Input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></label></div><DialogFooter><Button type="button" className="ghost-action" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" className="primary-action"><Check /> Salvar cadastro</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}

function ActivityLog({ state, role }: { state: AppState; role: Role }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | Activity["severity"]>("all");
  const entries = state.activities.filter((entry) => role === "admin" || entry.actor === "Renan Coutinho").filter((entry) => `${entry.title} ${entry.detail} ${entry.actor}`.toLowerCase().includes(query.toLowerCase())).filter((entry) => severity === "all" || entry.severity === severity);
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = ["Data,Ator,Evento,Detalhe,Severidade", ...entries.map((entry) => [entry.createdAt, entry.actor, entry.title, entry.detail, entry.severity].map(escape).join(","))].join("\n");
    downloadText(`\uFEFF${csv}`, "iago-security-atividades.csv"); toast.success("Registro exportado em CSV");
  };
  return <div className="page-stack"><section className="page-intro"><div><span className="eyebrow"><ActivityIcon /> Rastreabilidade</span><h2>{role === "admin" ? "Registro de atividades" : "Meu histórico"}</h2><p>Cada operação relevante deixa uma trilha datada no cofre.</p></div><Button className="secondary-action" onClick={exportCsv}><Download /> Exportar CSV</Button></section><section className="surface data-surface"><div className="table-toolbar"><label className="table-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evento, ator ou detalhe" /></label><NativeSelect value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><NativeSelectOption value="all">Todas as severidades</NativeSelectOption><NativeSelectOption value="info">Informação</NativeSelectOption><NativeSelectOption value="success">Sucesso</NativeSelectOption><NativeSelectOption value="warning">Atenção</NativeSelectOption><NativeSelectOption value="critical">Crítico</NativeSelectOption></NativeSelect></div><div className="timeline">{entries.length === 0 ? <EmptyState icon={History} title="Nenhum evento encontrado" description="Altere os filtros para consultar outros registros." /> : entries.map((entry) => <div key={entry.id} className="timeline-entry"><span className={`timeline-marker severity-${entry.severity}`}>{entry.severity === "success" ? <Check /> : entry.severity === "warning" || entry.severity === "critical" ? <AlertTriangle /> : <CircleDot />}</span><div><span className="timeline-title"><strong>{entry.title}</strong><em>{entry.actor}</em></span><p>{entry.detail}</p><small>{formatDate(entry.createdAt)} · {entry.type}</small></div></div>)}</div></section></div>;
}

function UserInbox({ state, commit }: { state: AppState; commit: (updater: (state: AppState) => AppState) => void }) {
  const [dragging, setDragging] = useState(false);
  const [inspection, setInspection] = useState<SecureMessageEnvelope | null>(null);
  const [selected, setSelected] = useState<ProtectedMessage | null>(null);
  const [code, setCode] = useState("");
  const [revealed, setRevealed] = useState("");
  const [working, setWorking] = useState(false);
  const lucas = state.collaborators.find((person) => person.id === "usr-renan-coutinho")!;
  const messages = state.messages.filter((message) => message.recipientId === "usr-renan-coutinho").map((message) => ({ ...message, status: effectiveStatus(message) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pending = messages.filter((message) => message.status === "delivered").length;

  const parseFile = async (file?: File) => {
    if (!file) return;
    setWorking(true);
    try {
      if (!file.name.toLowerCase().endsWith(".securemsg")) throw new Error("Selecione um arquivo com extensão .securemsg.");
      if (file.size > 2_000_000) throw new Error("O arquivo excede o limite de 2 MB.");
      const parsed = JSON.parse(await file.text()) as unknown;
      const envelope = await validateEnvelope(parsed);
      if (envelope.recipient.id !== lucas.id || envelope.recipient.email.toLowerCase() !== lucas.email.toLowerCase()) {
        commit((current) => ({ ...current, activities: [activity("Importação bloqueada", `O arquivo ${file.name} pertence a outro destinatário.`, "Renan Coutinho", "critical", "message.import.denied"), ...current.activities] }));
        throw new Error("Esta mensagem foi destinada a outra identidade.");
      }
      if (state.messages.some((message) => message.id === envelope.messageId && message.imported)) throw new Error("Esta mensagem já foi importada neste cofre.");
      if (new Date(envelope.expiresAt).getTime() <= Date.now()) throw new Error("A mensagem expirou antes da importação.");
      setInspection(envelope);
    } catch (error) {
      commit((current) => ({ ...current, activities: [activity("Falha na importação", error instanceof Error ? error.message : "Arquivo inválido.", "Renan Coutinho", "critical", "message.import.failed"), ...current.activities] }));
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o arquivo.");
    } finally { setWorking(false); }
  };
  const acceptImport = () => {
    if (!inspection) return;
    const message = envelopeToMessage(inspection);
    commit((current) => ({ ...current, messages: [message, ...current.messages.filter((item) => item.id !== message.id)], activities: [activity("Mensagem importada", `${message.title} passou pela validação de integridade.`, "Renan Coutinho", "success", "message.imported", message.id), ...current.activities] }));
    setInspection(null); toast.success("Mensagem importada e verificada");
  };
  const openMessage = (message: ProtectedMessage) => { setSelected(message); setCode(""); setRevealed(""); };
  const reveal = async () => {
    if (!selected) return;
    setWorking(true);
    try {
      const content = await revealMessage(selected, code);
      const timestamp = new Date().toISOString();
      setRevealed(content);
      setSelected({ ...selected, status: "revealed", revealedAt: timestamp, updatedAt: timestamp });
      commit((current) => ({ ...current, messages: current.messages.map((message) => message.id === selected.id ? { ...message, status: "revealed", revealedAt: timestamp, updatedAt: timestamp } : message), activities: [activity("Mensagem revelada", `${selected.title} foi descriptografada por Renan Coutinho.`, "Renan Coutinho", "success", "message.revealed", selected.id), ...current.activities] }));
      toast.success("Conteúdo revelado com segurança");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível revelar."); }
    finally { setWorking(false); }
  };
  const acknowledge = () => {
    if (!selected) return;
    const timestamp = new Date().toISOString();
    commit((current) => ({ ...current, messages: current.messages.map((message) => message.id === selected.id ? { ...message, acknowledgedAt: timestamp, updatedAt: timestamp } : message), activities: [activity("Leitura confirmada", `${selected.title} recebeu confirmação de leitura.`, "Renan Coutinho", "success", "message.acknowledged", selected.id), ...current.activities] }));
    setSelected({ ...selected, acknowledgedAt: timestamp }); toast.success("Leitura confirmada");
  };
  return <div className="page-stack user-home"><section className="user-hero"><div><span className="eyebrow"><ShieldCheck /> Área do colaborador</span><h2>Boa noite, Renan.</h2><p>{pending > 0 ? `Você tem ${pending} ${pending === 1 ? "mensagem pronta" : "mensagens prontas"} para revelar.` : "Todas as mensagens recebidas estão organizadas."}</p></div><div className="user-security-chip"><Fingerprint /><span><strong>Identidade validada</strong><small>{lucas.email}</small></span></div></section><section className="user-grid"><article className="import-card"><div className="import-copy"><span className="card-label">Receber conteúdo</span><h3>Importar mensagem protegida</h3><p>O arquivo será verificado integralmente antes de entrar no cofre.</p><label className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); void parseFile(event.dataTransfer.files[0]); }}><input type="file" accept=".securemsg" onChange={(event) => { void parseFile(event.target.files?.[0]); event.target.value = ""; }} /><span className="drop-icon">{working ? <RefreshCw className="spin" /> : <FileUp />}</span><strong>{dragging ? "Solte para verificar" : "Arraste o arquivo .securemsg"}</strong><small>ou clique para selecionar · limite de 2 MB</small></label></div><div className="import-guarantees"><span><CheckCircle2 /> Formato verificado</span><span><CheckCircle2 /> Destinatário confirmado</span><span><CheckCircle2 /> Integridade SHA‑256</span></div></article><article className="user-stats"><div><span className="metric-icon cyan"><Inbox /></span><span><strong>{pending}</strong><small>Aguardando leitura</small></span></div><div><span className="metric-icon green"><Eye /></span><span><strong>{messages.filter((message) => message.status === "revealed").length}</strong><small>Reveladas</small></span></div><div><span className="metric-icon amber"><History /></span><span><strong>{messages.filter((message) => message.status === "expired").length}</strong><small>Expiradas</small></span></div></article></section><section className="surface user-messages"><div className="surface-head"><div><span className="card-label">Seu cofre</span><h3>Mensagens recebidas</h3></div><span>{messages.length} itens</span></div><div className="inbox-list">{messages.length === 0 ? <EmptyState icon={Inbox} title="Seu cofre está vazio" description="Importe um arquivo .securemsg para começar." /> : messages.map((message) => <button key={message.id} onClick={() => openMessage(message)} disabled={!["delivered", "revealed"].includes(message.status) || (!message.encryptedPayload && message.status === "revealed")}><span className={`inbox-symbol status-${message.status}`}>{message.status === "revealed" ? <Eye /> : message.status === "expired" ? <History /> : <FileKey2 />}</span><span className="inbox-copy"><span><PriorityBadge priority={message.priority} /><small>{formatDate(message.createdAt)}</small></span><strong>{message.title}</strong><small>De {message.senderName} · expira {relativeDate(message.expiresAt)}</small></span><StatusBadge status={message.status} /><ArrowRight /></button>)}</div></section>
    <Dialog open={Boolean(inspection)} onOpenChange={(open) => !open && setInspection(null)}><DialogContent className="cipher-dialog"><DialogHeader><div className="dialog-icon success"><FileCheck2 /></div><DialogTitle>Arquivo íntegro</DialogTitle><DialogDescription>A assinatura e a estrutura foram verificadas.</DialogDescription></DialogHeader>{inspection && <div className="inspection"><div><small>Mensagem</small><strong>{inspection.title}</strong></div><div><small>Remetente</small><strong>{inspection.sender.name}</strong><span>{inspection.sender.email}</span></div><div><small>Prioridade</small><PriorityBadge priority={inspection.priority} /></div><div><small>Expiração</small><strong>{formatDate(inspection.expiresAt)}</strong></div><div className="inspection-hash"><small>SHA‑256</small><code>{inspection.integrityHash}</code></div></div>}<DialogFooter><Button className="ghost-action" onClick={() => setInspection(null)}>Cancelar</Button><Button className="primary-action" onClick={acceptImport}><ShieldCheck /> Adicionar ao cofre</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setRevealed(""); setCode(""); } }}><DialogContent className="cipher-dialog reveal-dialog">{selected && <>{!revealed ? <><DialogHeader><div className="dialog-icon"><LockKeyhole /></div><DialogTitle>{selected.title}</DialogTitle><DialogDescription>De {selected.senderName} · {formatDate(selected.createdAt)}</DialogDescription></DialogHeader><div className="pre-reveal"><div className="security-check"><CheckCircle2 /><span><strong>Integridade confirmada</strong><small>O arquivo não foi alterado desde a emissão.</small></span></div><div className="message-detail-grid"><div><small>Prioridade</small><PriorityBadge priority={selected.priority} /></div><div><small>Expiração</small><strong>{formatDate(selected.expiresAt)}</strong></div></div>{selected.note && <div className="detail-note"><small>Observação do remetente</small><p>{selected.note}</p></div>}<label className="field access-code"><span>Código de acesso</span><div><KeyRound /><Input type="password" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void reveal()} placeholder="Digite o código recebido" /></div><small>O código é processado apenas neste dispositivo.</small></label></div><DialogFooter><Button className="ghost-action" onClick={() => setSelected(null)}>Cancelar</Button><Button className="primary-action" disabled={working || code.length < 8} onClick={() => void reveal()}>{working ? <RefreshCw className="spin" /> : <Eye />} Revelar conteúdo</Button></DialogFooter></> : <div className="revealed-view"><div className="reveal-success"><span><Eye /></span><div><small>Conteúdo revelado</small><h2>{selected.title}</h2></div></div><div className="revealed-content sensitive-content"><p>{revealed}</p></div><div className="revealed-meta"><span><ShieldCheck /> Descriptografado neste dispositivo</span><span>{formatDate(new Date().toISOString())}</span></div>{selected.requiresAck && !selected.acknowledgedAt && <Button className="primary-action" onClick={acknowledge}><CheckCircle2 /> Confirmar que li</Button>}{selected.acknowledgedAt && <div className="acknowledged"><CheckCircle2 /> Leitura confirmada em {formatDate(selected.acknowledgedAt)}</div>}{selected.oneTime && <p className="one-time-warning"><AlertTriangle /> Esta foi a única revelação permitida. Ao fechar, o conteúdo não poderá ser reaberto neste cofre.</p>}</div>}</>}</DialogContent></Dialog>
  </div>;
}

function SettingsView({ state, commit, syncStatus, online, onSync }: { state: AppState; commit: (updater: (state: AppState) => AppState) => void; syncStatus: SyncStatus; online: boolean; onSync: () => void }) {
  const [backupPass, setBackupPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const updateSettings = (patch: Partial<AppState["settings"]>) => commit((current) => ({ ...current, settings: { ...current.settings, ...patch }, activities: [activity("Preferências atualizadas", "As configurações deste ambiente foram alteradas.", "Operador atual", "info", "settings.updated"), ...current.activities] }));
  const exportBackup = async () => {
    setWorking(true);
    try { const backup = await protectBackup(state, backupPass); downloadJson(backup, `iago-security-backup-${new Date().toISOString().slice(0, 10)}.json`); setBackupPass(""); toast.success("Backup cifrado baixado"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha no backup."); }
    finally { setWorking(false); }
  };
  const restore = async () => {
    if (!restoreFile) return toast.error("Selecione o arquivo de backup.");
    setWorking(true);
    try { const restored = await openBackup(JSON.parse(await restoreFile.text()), restorePass); if (!isAppState(restored)) throw new Error("O backup não contém um estado compatível."); commit(() => ({ ...restored, activities: [activity("Backup restaurado", "O estado do cofre foi recuperado de um arquivo cifrado.", "Operador atual", "success", "backup.restored"), ...restored.activities] })); setRestoreFile(null); setRestorePass(""); toast.success("Backup restaurado com sucesso"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Falha na restauração."); }
    finally { setWorking(false); }
  };
  return <div className="page-stack settings-page"><section className="page-intro"><div><span className="eyebrow"><Settings /> Controle do ambiente</span><h2>Configurações</h2><p>Privacidade, aparência, continuidade e recuperação do cofre.</p></div></section><div className="settings-layout"><section className="surface settings-section"><div className="settings-heading"><span className="settings-icon"><Moon /></span><div><h3>Aparência e conforto</h3><p>Ajustes exclusivos deste dispositivo.</p></div></div><div className="setting-list"><label><span><strong>Tema claro</strong><small>Alterna entre o navy profundo e uma superfície clara.</small></span><Switch checked={state.settings.theme === "light"} onCheckedChange={(checked) => updateSettings({ theme: checked ? "light" : "dark" })} /></label><label><span><strong>Reduzir movimento</strong><small>Remove transições e efeitos não essenciais.</small></span><Switch checked={state.settings.reducedMotion} onCheckedChange={(checked) => updateSettings({ reducedMotion: checked })} /></label><label><span><strong>Modo de privacidade</strong><small>Desfoca conteúdo sensível até receber foco ou passar o cursor.</small></span><Switch checked={state.settings.privacyMode} onCheckedChange={(checked) => updateSettings({ privacyMode: checked })} /></label><label><span><strong>Interface compacta</strong><small>Reduz espaços para mostrar mais registros.</small></span><Switch checked={state.settings.compactMode} onCheckedChange={(checked) => updateSettings({ compactMode: checked })} /></label></div></section><section className="surface settings-section"><div className="settings-heading"><span className="settings-icon"><Lock /></span><div><h3>Sessão e avisos</h3><p>Defina quando o ambiente deve ser bloqueado.</p></div></div><div className="setting-list"><label><span><strong>Notificações internas</strong><small>Exibe alertas de expiração e operação.</small></span><Switch checked={state.settings.notifications} onCheckedChange={(checked) => updateSettings({ notifications: checked })} /></label><label className="select-setting"><span><strong>Bloqueio por inatividade</strong><small>Retorna à seleção de ambiente automaticamente.</small></span><NativeSelect value={String(state.settings.autoLockMinutes)} onChange={(event) => updateSettings({ autoLockMinutes: Number(event.target.value) })}><NativeSelectOption value="0">Nunca</NativeSelectOption><NativeSelectOption value="5">5 minutos</NativeSelectOption><NativeSelectOption value="15">15 minutos</NativeSelectOption><NativeSelectOption value="30">30 minutos</NativeSelectOption><NativeSelectOption value="60">1 hora</NativeSelectOption></NativeSelect></label></div></section><section className="surface settings-section sync-section"><div className="settings-heading"><span className="settings-icon"><Cloud /></span><div><h3>Continuidade</h3><p>O cofre local continua disponível sem rede.</p></div></div><div className="sync-state-card"><span className={`sync-state-icon sync-${syncStatus}`}>{syncStatus === "syncing" ? <RefreshCw className="spin" /> : online ? <Cloud /> : <CloudOff />}</span><div><strong>{syncStatus === "synced" ? "Tudo sincronizado" : syncStatus === "syncing" ? "Sincronizando alterações" : !online ? "Operando offline" : syncStatus === "error" ? "Sincronização indisponível" : "Alterações salvas localmente"}</strong><small>{online ? "Os dados persistem neste dispositivo e no cofre privado." : "As alterações estão na fila segura deste dispositivo."}</small></div><Button className="secondary-action" onClick={onSync} disabled={!online || syncStatus === "syncing"}><RefreshCw /> Tentar agora</Button></div><Button className="install-button" onClick={() => toast.info("Use a opção ‘Instalar aplicativo’ do seu navegador para adicionar o Iago Security.")}><Download /> Instalar Iago Security neste dispositivo</Button></section><section className="surface settings-section backup-section"><div className="settings-heading"><span className="settings-icon"><Archive /></span><div><h3>Backup cifrado</h3><p>Exporte uma cópia protegida ou restaure o cofre.</p></div></div><div className="backup-grid"><div><h4>Exportar</h4><p>Gera um arquivo AES‑GCM com todo o estado do ambiente.</p><label className="field"><span>Senha do backup</span><Input type="password" value={backupPass} onChange={(event) => setBackupPass(event.target.value)} placeholder="Mínimo de 8 caracteres" /></label><Button className="secondary-action" disabled={working || backupPass.length < 8} onClick={() => void exportBackup()}><Download /> Baixar backup</Button></div><div><h4>Restaurar</h4><p>Substitui o estado atual após descriptografar e validar.</p><label className="file-picker"><Upload /><span>{restoreFile?.name ?? "Selecionar backup .json"}</span><input type="file" accept="application/json,.json" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} /></label><label className="field"><span>Senha do backup</span><Input type="password" value={restorePass} onChange={(event) => setRestorePass(event.target.value)} /></label><Button className="secondary-action" disabled={working || !restoreFile || restorePass.length < 8} onClick={() => void restore()}><RefreshCw /> Restaurar cofre</Button></div></div></section></div><section className="security-disclosure"><ShieldAlert /><div><strong>Escopo de segurança</strong><p>As mensagens e backups usam criptografia real via Web Crypto API. A proteção do arquivo depende da força e do sigilo do código escolhido. Este projeto não substitui gestão corporativa de chaves, auditoria independente ou infraestrutura certificada.</p></div></section></div>;
}
