import type { ModelMessage, TextPart, ToolCallPart, ToolResultPart } from "ai";
import type {
  CompactionEntry,
  Message,
  SessionEntry,
  ToolPart,
} from "../hooks/use-chat";

// Auto-compact once the context reaches this fraction of the model's window
export const AUTO_COMPACT_THRESHOLD = 0.75;

// Recent exchanges kept verbatim after a compaction, as long as they fit the budget
const KEEP_EXCHANGES = 2;
const KEPT_BUDGET_RATIO = 0.25;

// Older tool results are trimmed before being resent to the model
const MAX_HISTORY_TOOL_OUTPUT = 4_000;
// Subagent reports are the distilled result of a whole research task
const MAX_HISTORY_TASK_OUTPUT = 16_000;
const MAX_TRANSCRIPT_TOOL_OUTPUT = 1_000;
const TRANSCRIPT_BUDGET_RATIO = 0.6;
const CHARS_PER_TOKEN = 4;

export const COMPACTION_SYSTEM_PROMPT = `You are compacting the history of a conversation between a user and an AI coding assistant working in a terminal. The summary you write will replace the earlier conversation, so the assistant must be able to continue the work from it alone.

Write a concise but complete summary with these sections:
1. **Goal** — what the user is trying to accomplish, including constraints and preferences they stated.
2. **Key decisions** — choices made and why.
3. **Files** — files read, created or modified, with what changed and why.
4. **Current state** — what is done, what is in progress, and any errors or open problems.
5. **Next steps** — what remains, in order.

Keep exact file paths, function names, commands and error messages. Omit pleasantries and anything already superseded. If a previous summary is included, merge it into the new one.`;

export function isCompaction(entry: SessionEntry): entry is CompactionEntry {
  return entry.role === "compaction";
}

function isToolPart(part: Message["parts"][number]): part is ToolPart {
  return part.type.startsWith("tool-");
}

function truncate(value: string, limit: number) {
  return value.length > limit
    ? `${value.slice(0, limit)}\n... (truncated, ${value.length} total chars)`
    : value;
}

function messageText(msg: Message) {
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export type ActiveWindow = {
  compaction: CompactionEntry | null;
  messages: Message[];
};

// Everything the UI shows and the model sees: the latest compaction (if any),
// the messages it kept verbatim, and everything after it.
export function getActiveWindow(entries: SessionEntry[]): ActiveWindow {
  const index = entries.findLastIndex(isCompaction);
  if (index === -1) {
    return { compaction: null, messages: entries.filter((e) => !isCompaction(e)) };
  }

  const compaction = entries[index] as CompactionEntry;
  const keptIndex = compaction.keptFromId
    ? entries.findIndex((e) => e.id === compaction.keptFromId)
    : -1;
  const start = keptIndex !== -1 && keptIndex < index ? keptIndex : index + 1;

  return {
    compaction,
    messages: entries.slice(start).filter((e): e is Message => !isCompaction(e)),
  };
}

// Context size reported by the most recent model call in this window
export function getContextTokens(window: ActiveWindow): number {
  for (let i = window.messages.length - 1; i >= 0; i--) {
    const tokens = window.messages[i]!.metadata?.contextTokens;
    if (tokens != null) return tokens;
  }
  return 0;
}

export function isOverThreshold(contextTokens: number, contextWindow: number) {
  return contextTokens >= contextWindow * AUTO_COMPACT_THRESHOLD;
}

function toolResultOutput(part: ToolPart) {
  if (part.state === "output-available") {
    const limit =
      part.type === "tool-task" ? MAX_HISTORY_TASK_OUTPUT : MAX_HISTORY_TOOL_OUTPUT;
    return {
      type: "text" as const,
      value: truncate(JSON.stringify(part.output), limit),
    };
  }
  if (part.state === "output-error") {
    return { type: "error-text" as const, value: part.errorText };
  }
  return {
    type: "error-text" as const,
    value: "Tool call was interrupted before it finished",
  };
}

// Converts stored messages to model messages, including tool calls and their
// (trimmed) results. A text part after tool calls marks the start of a new step.
export function toModelMessages(messages: Message[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = messageText(msg);
      if (text.trim()) result.push({ role: "user", content: text });
      continue;
    }

    let content: (TextPart | ToolCallPart)[] = [];
    let results: ToolResultPart[] = [];

    const flush = () => {
      if (content.length) result.push({ role: "assistant", content });
      if (results.length) result.push({ role: "tool", content: results });
      content = [];
      results = [];
    };

    for (const part of msg.parts) {
      if (part.type === "text") {
        if (results.length) flush();
        if (part.text.trim()) content.push({ type: "text", text: part.text });
      } else if (isToolPart(part)) {
        const toolName = part.type.slice("tool-".length);
        content.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName,
          input: part.input,
        });
        results.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName,
          output: toolResultOutput(part),
        });
      }
    }
    flush();
  }

  return result;
}

function estimateTokens(messages: Message[]) {
  return JSON.stringify(toModelMessages(messages)).length / CHARS_PER_TOKEN;
}

// Index of the first message to keep verbatim: the last KEEP_EXCHANGES user
// turns and their replies, dropping the oldest of them if they don't fit the budget.
export function selectKeptStart(messages: Message[], contextWindow: number): number {
  const budget = contextWindow * KEPT_BUDGET_RATIO;
  const userIndices = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));

  for (let keep = Math.min(KEEP_EXCHANGES, userIndices.length); keep > 0; keep--) {
    const start = userIndices[userIndices.length - keep]!;
    if (estimateTokens(messages.slice(start)) <= budget) return start;
  }
  return messages.length;
}

function transcriptSection(msg: Message): string {
  if (msg.role === "user") return `### User\n${messageText(msg)}`;

  const lines = msg.parts.flatMap((part) => {
    if (part.type === "text") return part.text.trim() ? [part.text] : [];
    if (!isToolPart(part)) return [];
    const toolName = part.type.slice("tool-".length);
    const output =
      part.state === "output-available"
        ? truncate(JSON.stringify(part.output), MAX_TRANSCRIPT_TOOL_OUTPUT)
        : part.state === "output-error"
          ? `error: ${part.errorText}`
          : "interrupted";
    return [`[tool ${toolName}] ${JSON.stringify(part.input)}\n→ ${output}`];
  });
  return `### Assistant\n${lines.join("\n")}`;
}

// Plain-text transcript for the summarizer. If it's too long, the oldest
// messages are dropped (the previous summary is always kept).
export function buildTranscript(
  previousSummary: string | undefined,
  messages: Message[],
  contextWindow: number,
): string {
  const maxChars = contextWindow * TRANSCRIPT_BUDGET_RATIO * CHARS_PER_TOKEN;
  const header = previousSummary
    ? `## Previous summary\n${previousSummary}\n\n## Conversation since then\n`
    : "## Conversation\n";

  const sections = messages.map(transcriptSection);
  let total = header.length + sections.reduce((n, s) => n + s.length + 2, 0);
  let dropped = 0;
  while (sections.length > 1 && total > maxChars) {
    total -= sections.shift()!.length + 2;
    dropped++;
  }

  const omitted = dropped ? `[${dropped} earlier messages omitted]\n\n` : "";
  return `${header}${omitted}${sections.join("\n\n")}`;
}

export function stripThinkTags(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
