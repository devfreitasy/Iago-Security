export type Role = "admin" | "user";
export type View =
  | "overview"
  | "compose"
  | "messages"
  | "binary-tree"
  | "collaborators"
  | "activity"
  | "settings"
  | "inbox";

export type Priority = "low" | "normal" | "high" | "critical";
export type MessageStatus =
  | "draft"
  | "waiting"
  | "delivered"
  | "revealed"
  | "expired"
  | "revoked";

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  status: "active" | "inactive";
  lastActive: string;
  createdAt: string;
  updatedAt: string;
};

export type ProtectedMessage = {
  id: string;
  title: string;
  senderName: string;
  senderEmail: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  priority: Priority;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  oneTime: boolean;
  requiresAck: boolean;
  note: string;
  encryptedPayload?: string;
  salt?: string;
  iv?: string;
  integrityHash?: string;
  exportedAt?: string;
  revealedAt?: string;
  acknowledgedAt?: string;
  draftContent?: string;
  imported?: boolean;
};

export type ActivitySeverity = "info" | "success" | "warning" | "critical";

export type Activity = {
  id: string;
  type: string;
  title: string;
  detail: string;
  actor: string;
  actorEmail?: string;
  severity: ActivitySeverity;
  createdAt: string;
  messageId?: string;
};

export type AppSettings = {
  theme: "dark" | "light";
  reducedMotion: boolean;
  privacyMode: boolean;
  autoLockMinutes: number;
  notifications: boolean;
  compactMode: boolean;
};

export type AppState = {
  schemaVersion: 1;
  workspaceId: string;
  updatedAt: string;
  collaborators: Collaborator[];
  messages: ProtectedMessage[];
  activities: Activity[];
  settings: AppSettings;
};

export type SecureMessageEnvelope = {
  format: "iago-security.securemsg";
  version: 1;
  messageId: string;
  title: string;
  sender: { name: string; email: string };
  recipient: { id: string; name: string; email: string };
  priority: Priority;
  createdAt: string;
  expiresAt: string;
  policy: { oneTime: boolean; requiresAck: boolean };
  note: string;
  crypto: {
    algorithm: "AES-GCM";
    derivation: "PBKDF2-SHA-256";
    iterations: 250000;
    salt: string;
    iv: string;
    ciphertext: string;
  };
  integrityHash: string;
};

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
