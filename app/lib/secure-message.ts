import type { ProtectedMessage, SecureMessageEnvelope } from "../types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function deriveKey(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(code.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function authenticatedMetadata(message: Pick<
  ProtectedMessage,
  | "id"
  | "title"
  | "senderEmail"
  | "recipientEmail"
  | "priority"
  | "createdAt"
  | "expiresAt"
  | "oneTime"
  | "requiresAck"
>): string {
  return canonicalString({
    id: message.id,
    title: message.title,
    senderEmail: message.senderEmail,
    recipientEmail: message.recipientEmail,
    priority: message.priority,
    createdAt: message.createdAt,
    expiresAt: message.expiresAt,
    oneTime: message.oneTime,
    requiresAck: message.requiresAck,
  });
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export async function protectMessage(
  message: ProtectedMessage,
  content: string,
  accessCode: string,
): Promise<ProtectedMessage> {
  if (accessCode.trim().length < 8) {
    throw new Error("O código de acesso precisa ter ao menos 8 caracteres.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(accessCode, salt);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(authenticatedMetadata(message)),
    },
    key,
    encoder.encode(content),
  );
  const protectedMessage: ProtectedMessage = {
    ...message,
    status: "waiting",
    updatedAt: new Date().toISOString(),
    draftContent: undefined,
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
  };
  const envelope = envelopeWithoutHash(protectedMessage);
  return {
    ...protectedMessage,
    integrityHash: await sha256(canonicalString(envelope)),
  };
}

function envelopeWithoutHash(message: ProtectedMessage) {
  if (!message.encryptedPayload || !message.salt || !message.iv) {
    throw new Error("A mensagem ainda não possui conteúdo protegido.");
  }
  return {
    format: "iago-security.securemsg" as const,
    version: 1 as const,
    messageId: message.id,
    title: message.title,
    sender: { name: message.senderName, email: message.senderEmail },
    recipient: {
      id: message.recipientId,
      name: message.recipientName,
      email: message.recipientEmail,
    },
    priority: message.priority,
    createdAt: message.createdAt,
    expiresAt: message.expiresAt,
    policy: { oneTime: message.oneTime, requiresAck: message.requiresAck },
    note: message.note,
    crypto: {
      algorithm: "AES-GCM" as const,
      derivation: "PBKDF2-SHA-256" as const,
      iterations: 250000 as const,
      salt: message.salt,
      iv: message.iv,
      ciphertext: message.encryptedPayload,
    },
  };
}

export function toEnvelope(message: ProtectedMessage): SecureMessageEnvelope {
  if (!message.integrityHash) throw new Error("Mensagem sem assinatura de integridade.");
  return { ...envelopeWithoutHash(message), integrityHash: message.integrityHash };
}

export async function validateEnvelope(value: unknown): Promise<SecureMessageEnvelope> {
  if (!value || typeof value !== "object") throw new Error("Arquivo vazio ou malformado.");
  const envelope = value as Partial<SecureMessageEnvelope>;
  if (
    envelope.format !== "iago-security.securemsg" ||
    envelope.version !== 1 ||
    !envelope.messageId ||
    !envelope.title ||
    !envelope.sender?.email ||
    !envelope.recipient?.id ||
    !envelope.recipient?.email ||
    !envelope.createdAt ||
    !envelope.expiresAt ||
    !envelope.crypto?.salt ||
    !envelope.crypto?.iv ||
    !envelope.crypto?.ciphertext ||
    envelope.crypto.algorithm !== "AES-GCM" ||
    envelope.crypto.derivation !== "PBKDF2-SHA-256" ||
    envelope.crypto.iterations !== 250000 ||
    !envelope.integrityHash
  ) {
    throw new Error("A estrutura do arquivo não corresponde ao formato Iago Security.");
  }
  const { integrityHash, ...unsigned } = envelope as SecureMessageEnvelope;
  const calculated = await sha256(canonicalString(unsigned));
  if (calculated !== integrityHash) {
    throw new Error("A assinatura não confere. O arquivo pode ter sido alterado.");
  }
  const expiration = new Date(envelope.expiresAt);
  if (Number.isNaN(expiration.getTime())) throw new Error("Data de expiração inválida.");
  return envelope as SecureMessageEnvelope;
}

export function envelopeToMessage(envelope: SecureMessageEnvelope): ProtectedMessage {
  return {
    id: envelope.messageId,
    title: envelope.title,
    senderName: envelope.sender.name,
    senderEmail: envelope.sender.email,
    recipientId: envelope.recipient.id,
    recipientName: envelope.recipient.name,
    recipientEmail: envelope.recipient.email,
    priority: envelope.priority,
    status: new Date(envelope.expiresAt).getTime() <= Date.now() ? "expired" : "delivered",
    createdAt: envelope.createdAt,
    updatedAt: new Date().toISOString(),
    expiresAt: envelope.expiresAt,
    oneTime: envelope.policy.oneTime,
    requiresAck: envelope.policy.requiresAck,
    note: envelope.note,
    encryptedPayload: envelope.crypto.ciphertext,
    salt: envelope.crypto.salt,
    iv: envelope.crypto.iv,
    integrityHash: envelope.integrityHash,
    imported: true,
  };
}

export async function revealMessage(
  message: ProtectedMessage,
  accessCode: string,
): Promise<string> {
  if (new Date(message.expiresAt).getTime() <= Date.now()) {
    throw new Error("Esta mensagem expirou e não pode mais ser revelada.");
  }
  if (message.oneTime && message.revealedAt) {
    throw new Error("A política desta mensagem permitia apenas uma revelação.");
  }
  if (!message.salt || !message.iv || !message.encryptedPayload) {
    throw new Error("O conteúdo protegido não está disponível.");
  }
  try {
    const key = await deriveKey(accessCode, base64ToBytes(message.salt));
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(message.iv),
        additionalData: encoder.encode(authenticatedMetadata(message)),
      },
      key,
      base64ToBytes(message.encryptedPayload),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error("Código incorreto ou conteúdo adulterado.");
  }
}

export function downloadEnvelope(message: ProtectedMessage): void {
  const envelope = toEnvelope(message);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/vnd.iago-security.securemsg+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${message.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "mensagem"}.securemsg`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function protectBackup(state: unknown, passphrase: string) {
  if (passphrase.length < 8) throw new Error("Use uma senha de backup com ao menos 8 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(state)),
  );
  return {
    format: "iago-security.backup",
    version: 1,
    createdAt: new Date().toISOString(),
    crypto: {
      algorithm: "AES-GCM",
      derivation: "PBKDF2-SHA-256",
      iterations: 250000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  };
}

export async function openBackup(value: unknown, passphrase: string): Promise<unknown> {
  const backup = value as {
    format?: string;
    version?: number;
    crypto?: { salt?: string; iv?: string; ciphertext?: string };
  };
  if (
    backup?.format !== "iago-security.backup" ||
    backup.version !== 1 ||
    !backup.crypto?.salt ||
    !backup.crypto.iv ||
    !backup.crypto.ciphertext
  ) {
    throw new Error("Este não é um backup Iago Security válido.");
  }
  try {
    const key = await deriveKey(passphrase, base64ToBytes(backup.crypto.salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(backup.crypto.iv) },
      key,
      base64ToBytes(backup.crypto.ciphertext),
    );
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    throw new Error("Senha incorreta ou backup corrompido.");
  }
}
