import type { ProtectedMessage } from "../types";

export type MessageTreeNode = {
  key: string;
  message: ProtectedMessage;
  left: MessageTreeNode | null;
  right: MessageTreeNode | null;
};

export type MessageTreeIndex = {
  root: MessageTreeNode | null;
  size: number;
  height: number;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function messageKey(message: ProtectedMessage) {
  return `${normalize(message.title)}\u0000${message.id}`;
}

function buildBalanced(messages: ProtectedMessage[]): MessageTreeNode | null {
  if (messages.length === 0) return null;
  const middle = Math.floor(messages.length / 2);
  const message = messages[middle];
  return {
    key: messageKey(message),
    message,
    left: buildBalanced(messages.slice(0, middle)),
    right: buildBalanced(messages.slice(middle + 1)),
  };
}

function nodeHeight(node: MessageTreeNode | null): number {
  if (!node) return 0;
  return 1 + Math.max(nodeHeight(node.left), nodeHeight(node.right));
}

export function buildMessageTree(messages: ProtectedMessage[]): MessageTreeIndex {
  const ordered = [...messages].sort((left, right) => messageKey(left).localeCompare(messageKey(right), "pt-BR"));
  const root = buildBalanced(ordered);
  return { root, size: ordered.length, height: nodeHeight(root) };
}

export function postOrderMessages(root: MessageTreeNode | null): ProtectedMessage[] {
  if (!root) return [];
  return [...postOrderMessages(root.left), ...postOrderMessages(root.right), root.message];
}

export function searchTitlePrefix(root: MessageTreeNode | null, query: string) {
  const prefix = normalize(query);
  if (!prefix) return { matches: postOrderMessages(root), path: [] as string[], comparisons: 0 };

  const matches: ProtectedMessage[] = [];
  const path: string[] = [];
  let comparisons = 0;
  let cursor = root;

  while (cursor) {
    comparisons += 1;
    path.push(cursor.message.id);
    const title = normalize(cursor.message.title);
    if (title.startsWith(prefix)) break;
    cursor = prefix.localeCompare(title, "pt-BR") < 0 ? cursor.left : cursor.right;
  }

  const collectRange = (node: MessageTreeNode | null) => {
    if (!node) return;
    const title = normalize(node.message.title);
    if (prefix.localeCompare(title, "pt-BR") <= 0) collectRange(node.left);
    comparisons += 1;
    if (title.startsWith(prefix)) matches.push(node.message);
    if (`${prefix}\uffff`.localeCompare(title, "pt-BR") >= 0) collectRange(node.right);
  };
  collectRange(root);
  const postOrderPosition = new Map(postOrderMessages(root).map((message, index) => [message.id, index]));
  matches.sort((left, right) => (postOrderPosition.get(left.id) ?? 0) - (postOrderPosition.get(right.id) ?? 0));
  return { matches, path, comparisons };
}
