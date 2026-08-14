import { randomUUID } from "node:crypto";
import type { ChatMessage, Locale } from "@innersun/shared";

/**
 * Conversation history, kept in memory (Feature 4).
 *
 * Deliberately temporary. The `conversations` and `messages` tables already
 * exist from Feature 3 but stay empty until Feature 5 makes history durable;
 * this module is what that feature replaces, and its shape is meant to make the
 * swap mechanical. Consequences of holding history in a process, for now:
 * history is lost on restart, and it does not survive more than one instance.
 */

/** Turns kept verbatim. Feature 8 replaces the drop with summarization. */
const MAX_TURNS = 20;

/** Idle conversations are dropped so a long-running dev server cannot grow forever. */
const TTL_MS = 2 * 60 * 60 * 1000;

interface Conversation {
  id: string;
  locale: Locale;
  messages: ChatMessage[];
  lastActiveAt: number;
}

const conversations = new Map<string, Conversation>();

/** Start a new conversation and return its id. */
export function createConversation(locale: Locale): Conversation {
  evictExpired();
  const conversation: Conversation = {
    id: randomUUID(),
    locale,
    messages: [],
    lastActiveAt: Date.now(),
  };
  conversations.set(conversation.id, conversation);
  return conversation;
}

/**
 * Look up an existing conversation. Returns undefined for an id we do not know
 * — which includes every id issued before the last restart. Callers surface
 * that as a 404 rather than silently adopting a client-supplied id, so that a
 * conversation id always means a conversation this server actually created.
 */
export function getConversation(id: string): Conversation | undefined {
  const conversation = conversations.get(id);
  if (!conversation) return undefined;
  if (Date.now() - conversation.lastActiveAt > TTL_MS) {
    conversations.delete(id);
    return undefined;
  }
  return conversation;
}

/** Append a turn, trimming the oldest turns past the cap. */
export function appendMessage(conversation: Conversation, message: ChatMessage): void {
  conversation.messages.push(message);
  if (conversation.messages.length > MAX_TURNS) {
    conversation.messages.splice(0, conversation.messages.length - MAX_TURNS);
  }
  conversation.lastActiveAt = Date.now();
}

/** Test/diagnostic helper: how many conversations are currently held. */
export function conversationCount(): number {
  return conversations.size;
}

function evictExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, conversation] of conversations) {
    if (conversation.lastActiveAt < cutoff) conversations.delete(id);
  }
}

export type { Conversation };
