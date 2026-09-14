import assert from "node:assert/strict";
import {
  openBackup,
  protectBackup,
  protectMessage,
  revealMessage,
  toEnvelope,
  validateEnvelope,
} from "../app/lib/secure-message.ts";
import { mergeStates } from "../app/lib/state.ts";
import { buildMessageTree, postOrderMessages, searchTitlePrefix } from "../app/lib/message-binary-tree.ts";

const now = new Date();
const expires = new Date(now.getTime() + 86_400_000);
const message = {
  id: "crypto-self-test",
  title: "Teste criptográfico",
  senderName: "Marina Alves",
  senderEmail: "marina@iago-security.local",
  recipientId: "usr-lucas-rocha",
  recipientName: "Lucas Rocha",
  recipientEmail: "lucas.rocha@iago-security.local",
  priority: "high",
  status: "waiting",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  expiresAt: expires.toISOString(),
  oneTime: false,
  requiresAck: true,
  note: "Teste automatizado",
};

const protectedMessage = await protectMessage(message, "Conteúdo secreto validado", "LUCAS-2026");
assert.notEqual(protectedMessage.encryptedPayload, "Conteúdo secreto validado");
assert.equal(await revealMessage(protectedMessage, "LUCAS-2026"), "Conteúdo secreto validado");
await assert.rejects(() => revealMessage(protectedMessage, "CODIGO-ERRADO"), /incorreto|adulterado/i);

const envelope = toEnvelope(protectedMessage);
assert.equal((await validateEnvelope(envelope)).messageId, message.id);
await assert.rejects(() => validateEnvelope({}), /estrutura|formato/i);
await assert.rejects(
  () => validateEnvelope({ ...envelope, title: "Arquivo adulterado" }),
  /assinatura não confere/i,
);
await assert.rejects(
  () => revealMessage({ ...protectedMessage, revealedAt: now.toISOString(), oneTime: true }, "LUCAS-2026"),
  /apenas uma revelação/i,
);
await assert.rejects(
  () => revealMessage({ ...protectedMessage, expiresAt: new Date(now.getTime() - 1000).toISOString() }, "LUCAS-2026"),
  /expirou/i,
);

const state = { schemaVersion: 1, records: ["a", "b"] };
const backup = await protectBackup(state, "BACKUP-2026");
assert.deepEqual(await openBackup(backup, "BACKUP-2026"), state);
await assert.rejects(() => openBackup(backup, "SENHA-ERRADA"), /incorreta|corrompido/i);

const merged = mergeStates(
  { schemaVersion: 1, workspaceId: "vault", updatedAt: "2026-01-02", collaborators: [], messages: [{ ...message, updatedAt: "2026-01-02" }], activities: [], settings: { theme: "dark", reducedMotion: false, privacyMode: false, autoLockMinutes: 15, notifications: true, compactMode: false } },
  { schemaVersion: 1, workspaceId: "vault", updatedAt: "2026-01-01", collaborators: [], messages: [{ ...message, title: "Versão antiga", updatedAt: "2026-01-01" }], activities: [], settings: { theme: "light", reducedMotion: false, privacyMode: false, autoLockMinutes: 15, notifications: true, compactMode: false } },
);
assert.equal(merged.messages[0].title, "Teste criptográfico");
assert.equal(merged.settings.theme, "dark");

const treeMessages = [
  { ...message, id: "m-1", title: "Plano Mestre" },
  { ...message, id: "m-2", title: "Acesso Administrativo" },
  { ...message, id: "m-3", title: "Zona Protegida" },
  { ...message, id: "m-4", title: "Backup Semanal" },
];
const tree = buildMessageTree(treeMessages);
assert.equal(tree.size, 4);
assert.equal(tree.height, 3);
assert.deepEqual(postOrderMessages(tree.root).map((item) => item.title), ["Acesso Administrativo", "Backup Semanal", "Zona Protegida", "Plano Mestre"]);
const treeSearch = searchTitlePrefix(tree.root, "backup");
assert.deepEqual(treeSearch.matches.map((item) => item.id), ["m-4"]);
assert.ok(treeSearch.path.length > 0);
assert.ok(treeSearch.comparisons > 0);

console.log("Iago Security self-test: encryption, binary tree, tamper detection, expiry, one-time access, backup and conflict merge passed");
