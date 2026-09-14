import type { Activity, AppState, AuthenticatedUser, Collaborator, ProtectedMessage } from "../types";

const DB_NAME = "iago-security-vault";
const STORE_NAME = "repository";
const STATE_KEY = "current-state";
const META_KEY = "sync-meta";

export type SyncMeta = {
  revision: number;
  dirty: boolean;
  lastSyncedAt: string | null;
};

function currentEmail(email: string | undefined) {
  return email
    ?.replace(/@cipherdesk\.local$/i, "@iago-security.local")
    .replace(/^lucas\.rocha@iago-security\.local$/i, "renan.coutinho@iago-security.local");
}

function currentName(name: string) {
  return name === "Marina Alves" ? "Garrido" : name === "Lucas Rocha" ? "Renan Coutinho" : name;
}

function currentIdentityId(id: string) {
  return id === "usr-lucas-rocha" ? "usr-renan-coutinho" : id;
}

function currentDetail(detail: string) {
  return detail.replaceAll("Marina Alves", "Garrido").replaceAll("Lucas Rocha", "Renan Coutinho");
}

function normalizeBrandState(state: AppState): AppState {
  return {
    ...state,
    collaborators: state.collaborators.map((person) => ({
      ...person,
      id: currentIdentityId(person.id),
      name: currentName(person.name),
      email: currentEmail(person.email) ?? person.email,
    })),
    messages: state.messages.map((message) => ({
      ...message,
      senderName: currentName(message.senderName),
      senderEmail: currentEmail(message.senderEmail) ?? message.senderEmail,
      recipientId: currentIdentityId(message.recipientId),
      recipientName: currentName(message.recipientName),
      recipientEmail: currentEmail(message.recipientEmail) ?? message.recipientEmail,
    })),
    activities: state.activities.map((entry) => ({
      ...entry,
      actor: currentName(entry.actor),
      actorEmail: currentEmail(entry.actorEmail),
      detail: currentDetail(entry.detail),
    })),
  };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function daysAgo(days: number, hours = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export function createInitialState(user: AuthenticatedUser): AppState {
  const now = new Date().toISOString();
  const collaborators: Collaborator[] = [
    {
      id: "usr-renan-coutinho",
      name: "Renan Coutinho",
      email: "renan.coutinho@iago-security.local",
      department: "Engenharia",
      jobTitle: "Analista de Sistemas",
      status: "active",
      lastActive: daysAgo(0, 2),
      createdAt: daysAgo(48),
      updatedAt: daysAgo(0, 2),
    },
    {
      id: "usr-ana-costa",
      name: "Ana Costa",
      email: "ana.costa@iago-security.local",
      department: "Financeiro",
      jobTitle: "Coordenadora Financeira",
      status: "active",
      lastActive: daysAgo(1),
      createdAt: daysAgo(80),
      updatedAt: daysAgo(1),
    },
    {
      id: "usr-rafael-lima",
      name: "Rafael Lima",
      email: "rafael.lima@iago-security.local",
      department: "Operações",
      jobTitle: "Especialista de Operações",
      status: "active",
      lastActive: daysAgo(3),
      createdAt: daysAgo(64),
      updatedAt: daysAgo(3),
    },
    {
      id: "usr-beatriz-souza",
      name: "Beatriz Souza",
      email: "beatriz.souza@iago-security.local",
      department: "Jurídico",
      jobTitle: "Anal Jurídica",
      status: "inactive",
      lastActive: daysAgo(21),
      createdAt: daysAgo(95),
      updatedAt: daysAgo(21),
    },
  ];
  const messages: ProtectedMessage[] = [
    {
      id: "msg-history-01",
      title: "Diretrizes de acesso — Q3",
      senderName: "Garrido",
      senderEmail: user.email,
      recipientId: "usr-renan-coutinho",
      recipientName: "Renan Coutinho",
      recipientEmail: "renan.coutinho@iago-security.local",
      priority: "high",
      status: "revealed",
      createdAt: daysAgo(4),
      updatedAt: daysAgo(3),
      expiresAt: daysFromNow(10),
      oneTime: false,
      requiresAck: true,
      note: "Leitura confirmada pelo destinatário.",
      revealedAt: daysAgo(3),
      acknowledgedAt: daysAgo(3),
    },
    {
      id: "msg-history-02",
      title: "Fechamento financeiro reservado",
      senderName: "Garrido",
      senderEmail: user.email,
      recipientId: "usr-ana-costa",
      recipientName: "Ana Costa",
      recipientEmail: "ana.costa@iago-security.local",
      priority: "critical",
      status: "delivered",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0, 8),
      expiresAt: daysFromNow(2),
      oneTime: true,
      requiresAck: true,
      note: "Expira em breve.",
    },
    {
      id: "msg-history-03",
      title: "Procedimento de contingência",
      senderName: "Garrido",
      senderEmail: user.email,
      recipientId: "usr-rafael-lima",
      recipientName: "Rafael Lima",
      recipientEmail: "rafael.lima@iago-security.local",
      priority: "normal",
      status: "waiting",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
      expiresAt: daysFromNow(14),
      oneTime: false,
      requiresAck: false,
      note: "Aguardando entrega do arquivo protegido.",
    },
    {
      id: "msg-history-04",
      title: "Credencial temporária de fornecedor",
      senderName: "Garrido",
      senderEmail: user.email,
      recipientId: "usr-beatriz-souza",
      recipientName: "Beatriz Souza",
      recipientEmail: "beatriz.souza@iago-security.local",
      priority: "low",
      status: "expired",
      createdAt: daysAgo(28),
      updatedAt: daysAgo(18),
      expiresAt: daysAgo(18),
      oneTime: true,
      requiresAck: false,
      note: "Conteúdo expirado automaticamente.",
    },
  ];
  const activities: Activity[] = [
    {
      id: "act-seed-01",
      type: "session",
      title: "Cofre iniciado",
      detail: "Ambiente protegido preparado para uso neste dispositivo.",
      actor: user.displayName,
      actorEmail: user.email,
      severity: "success",
      createdAt: now,
    },
    {
      id: "act-seed-02",
      type: "message.revealed",
      title: "Mensagem revelada",
      detail: "Renan Coutinho confirmou o recebimento de Diretrizes de acesso — Q3.",
      actor: "Renan Coutinho",
      actorEmail: "renan.coutinho@iago-security.local",
      severity: "success",
      createdAt: daysAgo(3),
      messageId: "msg-history-01",
    },
    {
      id: "act-seed-03",
      type: "message.created",
      title: "Mensagem protegida criada",
      detail: "Fechamento financeiro reservado foi destinado a Ana Costa.",
      actor: "Garrido",
      actorEmail: user.email,
      severity: "info",
      createdAt: daysAgo(1),
      messageId: "msg-history-02",
    },
  ];
  return {
    schemaVersion: 1,
    workspaceId: createId(),
    updatedAt: now,
    collaborators,
    messages,
    activities,
    settings: {
      theme: "dark",
      reducedMotion: false,
      privacyMode: false,
      autoLockMinutes: 15,
      notifications: true,
      compactMode: false,
    },
  };
}

export function activity(
  title: string,
  detail: string,
  actor: string,
  severity: Activity["severity"] = "info",
  type = "system",
  messageId?: string,
): Activity {
  return {
    id: createId(),
    type,
    title,
    detail,
    actor,
    severity,
    createdAt: new Date().toISOString(),
    messageId,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o cofre local."));
  });
}

async function readValue<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler o cofre local."));
    tx.oncomplete = () => db.close();
  });
}

async function writeValues(entries: [string, unknown][]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const [key, value] of entries) tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Falha ao salvar no cofre local."));
  });
}

export async function loadLocalRepository() {
  const [state, meta] = await Promise.all([
    readValue<AppState>(STATE_KEY),
    readValue<SyncMeta>(META_KEY),
  ]);
  return {
    state: state ? normalizeBrandState(state) : null,
    meta: meta ?? { revision: 0, dirty: false, lastSyncedAt: null },
  };
}

export async function saveLocalRepository(state: AppState, meta: SyncMeta): Promise<void> {
  await writeValues([
    [STATE_KEY, normalizeBrandState(state)],
    [META_KEY, meta],
  ]);
}

function newest<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[],
): T[] {
  const items = new Map<string, T>();
  for (const entry of [...remote, ...local]) {
    const existing = items.get(entry.id);
    const entryTime = entry.updatedAt ?? entry.createdAt ?? "";
    const existingTime = existing?.updatedAt ?? existing?.createdAt ?? "";
    if (!existing || entryTime >= existingTime) items.set(entry.id, entry);
  }
  return [...items.values()];
}

export function mergeStates(local: AppState, remote: AppState): AppState {
  local = normalizeBrandState(local);
  remote = normalizeBrandState(remote);
  const localIsNewer = local.updatedAt >= remote.updatedAt;
  return {
    schemaVersion: 1,
    workspaceId: local.workspaceId || remote.workspaceId,
    updatedAt: localIsNewer ? local.updatedAt : remote.updatedAt,
    collaborators: newest(local.collaborators, remote.collaborators),
    messages: newest(local.messages, remote.messages),
    activities: newest(local.activities, remote.activities)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 500),
    settings: localIsNewer ? local.settings : remote.settings,
  };
}

export function isAppState(value: unknown): value is AppState {
  const candidate = value as Partial<AppState>;
  return Boolean(
    candidate &&
      candidate.schemaVersion === 1 &&
      typeof candidate.workspaceId === "string" &&
      Array.isArray(candidate.collaborators) &&
      Array.isArray(candidate.messages) &&
      Array.isArray(candidate.activities) &&
      candidate.settings,
  );
}
