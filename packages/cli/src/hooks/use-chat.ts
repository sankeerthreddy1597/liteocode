import { useState, useCallback, useRef, useMemo } from "react";
import { streamText, generateText, stepCountIs, type LanguageModelUsage } from "ai";
import { getToolContracts, type ModeType, type AnyChatModelId } from "@litecode/shared";
import { resolveChatModel, getContextWindow } from "../lib/models";
import { buildSystemPrompt } from "../lib/system-prompt";
import { executeLocalTool } from "../lib/local-tools";
import { saveSessionMessages } from "../lib/sessions";
import { MAX_CONCURRENT_SUBAGENTS, createSemaphore, runSubagent } from "../lib/subagent";
import {
  COMPACTION_SYSTEM_PROMPT,
  buildTranscript,
  getActiveWindow,
  getContextTokens,
  isOverThreshold,
  selectKeptStart,
  stripThinkTags,
  toModelMessages,
} from "../lib/compaction";

// ---- Message types --------------------------------------------------------

export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string };
export type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  input: Record<string, unknown>;
} & (
  | { state: "call" }
  | { state: "partial-call" }
  | { state: "output-available"; output: unknown }
  | { state: "output-error"; errorText: string }
);

export type MessagePart = TextPart | ReasoningPart | ToolPart;

export type Message = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  metadata?: {
    mode: ModeType;
    model: string;
    durationMs?: number;
    // Context size (input + output tokens) of the latest model call in this turn
    contextTokens?: number;
  };
};

// Stored alongside messages; everything before it (except keptFromId onward)
// is hidden from the UI and replaced by `summary` in the model's context.
export type CompactionEntry = {
  id: string;
  role: "compaction";
  summary: string;
  trigger: "manual" | "auto";
  keptFromId?: string;
  tokensBefore?: number;
  model: string;
  createdAt: string;
};

export type SessionEntry = Message | CompactionEntry;

export type CompactResult = "compacted" | "empty" | "busy" | "aborted" | "error";

// ---- Helpers --------------------------------------------------------------

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

function contextTokensOf(usage: LanguageModelUsage | undefined) {
  return (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
}

// Parses <think>…</think> tags from Ollama text-delta chunks, routing the
// content inside to reasoning events and everything outside to text events.
function makeThinkParser() {
  let buffer = "";
  let inThinkBlock = false;

  return function process(chunk: string): { reasoning: string; text: string } {
    let remaining = buffer + chunk;
    buffer = "";
    let reasoningOut = "";
    let textOut = "";

    while (remaining.length > 0) {
      if (inThinkBlock) {
        const closeIdx = remaining.indexOf("</think>");
        if (closeIdx === -1) {
          const CLOSE = "</think>";
          let partialLen = 0;
          for (let i = 1; i < CLOSE.length; i++) {
            if (remaining.endsWith(CLOSE.slice(0, i))) partialLen = i;
          }
          const safeEnd = remaining.length - partialLen;
          if (safeEnd > 0) reasoningOut += remaining.slice(0, safeEnd);
          buffer = remaining.slice(safeEnd);
          remaining = "";
        } else {
          if (closeIdx > 0) reasoningOut += remaining.slice(0, closeIdx);
          inThinkBlock = false;
          remaining = remaining.slice(closeIdx + "</think>".length);
        }
      } else {
        const openIdx = remaining.indexOf("<think>");
        if (openIdx === -1) {
          const OPEN = "<think>";
          let partialLen = 0;
          for (let i = 1; i < OPEN.length; i++) {
            if (remaining.endsWith(OPEN.slice(0, i))) partialLen = i;
          }
          const safeEnd = remaining.length - partialLen;
          if (safeEnd > 0) textOut += remaining.slice(0, safeEnd);
          buffer = remaining.slice(safeEnd);
          remaining = "";
        } else {
          if (openIdx > 0) textOut += remaining.slice(0, openIdx);
          inThinkBlock = true;
          remaining = remaining.slice(openIdx + "<think>".length);
        }
      }
    }

    return { reasoning: reasoningOut, text: textOut };
  };
}

// ---- Hook -----------------------------------------------------------------

export function useChat(sessionId: string, initialEntries: SessionEntry[]) {
  const [entries, _setEntries] = useState<SessionEntry[]>(initialEntries);
  const [status, setStatus] = useState<
    "idle" | "submitted" | "streaming" | "compacting" | "error"
  >("idle");
  const [error, setError] = useState<Error | null>(null);
  // Live one-line status of each running subagent, keyed by its task tool call.
  // Not persisted; only the subagent's final report is stored.
  const [subagentActivity, setSubagentActivity] = useState<Record<string, string>>({});

  const setActivity = useCallback((toolCallId: string, activity: string | null) => {
    setSubagentActivity((prev) => {
      if (activity === null) {
        if (!(toolCallId in prev)) return prev;
        const { [toolCallId]: _, ...rest } = prev;
        return rest;
      }
      return prev[toolCallId] === activity ? prev : { ...prev, [toolCallId]: activity };
    });
  }, []);

  // Keep a ref in sync so callbacks never see stale entries
  const entriesRef = useRef(initialEntries);
  const setEntries = useCallback(
    (updater: SessionEntry[] | ((prev: SessionEntry[]) => SessionEntry[])) => {
      const next = typeof updater === "function" ? updater(entriesRef.current) : updater;
      entriesRef.current = next;
      _setEntries(next);
    },
    [],
  );

  const activeWindow = useMemo(() => getActiveWindow(entries), [entries]);
  const contextTokens = useMemo(() => getContextTokens(activeWindow), [activeWindow]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    busyRef.current = false;
    setSubagentActivity({});
    setStatus("idle");
  }, []);

  const interrupt = abort;

  // Summarizes the active window (minus the recent messages kept verbatim) and
  // appends a compaction entry. Throws on failure; nothing is written then.
  const runCompaction = useCallback(
    async (
      model: AnyChatModelId,
      trigger: CompactionEntry["trigger"],
      signal: AbortSignal,
    ): Promise<"compacted" | "empty"> => {
      const window = getActiveWindow(entriesRef.current);
      const contextWindow = getContextWindow(model);
      const keptStart = selectKeptStart(window.messages, contextWindow);
      const toSummarize = window.messages.slice(0, keptStart);
      if (toSummarize.length === 0) return "empty";

      setStatus("compacting");
      const resolvedModel = resolveChatModel(model);
      const { text } = await generateText({
        model: resolvedModel.model,
        system: COMPACTION_SYSTEM_PROMPT,
        prompt: buildTranscript(window.compaction?.summary, toSummarize, contextWindow),
        abortSignal: signal,
      });

      const summary = stripThinkTags(text);
      if (!summary) throw new Error("Compaction failed: the model returned an empty summary");
      if (signal.aborted) throw signal.reason;

      const contextTokens = getContextTokens(window);
      const entry: CompactionEntry = {
        id: crypto.randomUUID(),
        role: "compaction",
        summary,
        trigger,
        keptFromId: window.messages[keptStart]?.id,
        tokensBefore: contextTokens || undefined,
        model,
        createdAt: new Date().toISOString(),
      };
      setEntries((prev) => [...prev, entry]);
      await saveSessionMessages(sessionId, entriesRef.current);
      return "compacted";
    },
    [sessionId, setEntries],
  );

  const compact = useCallback(
    async (model: AnyChatModelId): Promise<CompactResult> => {
      if (busyRef.current) return "busy";
      busyRef.current = true;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);

      try {
        const result = await runCompaction(model, "manual", controller.signal);
        if (!controller.signal.aborted) setStatus("idle");
        return result;
      } catch (err) {
        if (controller.signal.aborted) return "aborted";
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
        return "error";
      } finally {
        if (abortControllerRef.current === controller) busyRef.current = false;
      }
    },
    [runCompaction],
  );

  const submit = useCallback(
    async ({
      userText,
      mode,
      model,
    }: {
      userText: string;
      mode: ModeType;
      model: AnyChatModelId;
    }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      busyRef.current = true;
      setError(null);

      const contextWindow = getContextWindow(model);
      const isCurrent = () => abortControllerRef.current === controller;

      try {
        // Covers switching to a model with a smaller window since the last turn
        if (isOverThreshold(getContextTokens(getActiveWindow(entriesRef.current)), contextWindow)) {
          await runCompaction(model, "auto", controller.signal);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
        if (isCurrent()) busyRef.current = false;
        return;
      }

      const window = getActiveWindow(entriesRef.current);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: userText }],
        metadata: { mode, model },
      };
      setEntries((prev) => [...prev, userMessage]);
      setStatus("submitted");

      const assistantId = crypto.randomUUID();
      const assistantParts: MessagePart[] = [];
      const startTime = Date.now();
      let lastContextTokens: number | undefined;

      const emitAssistant = (durationMs?: number) => {
        const msg: Message = {
          id: assistantId,
          role: "assistant",
          parts: [...assistantParts],
          metadata: {
            mode,
            model,
            ...(durationMs != null ? { durationMs } : {}),
            ...(lastContextTokens != null ? { contextTokens: lastContextTokens } : {}),
          },
        };
        setEntries((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          return exists ? prev.map((m) => (m.id === assistantId ? msg : m)) : [...prev, msg];
        });
      };

      const appendReasoning = (text: string) => {
        const last = assistantParts[assistantParts.length - 1];
        if (last?.type === "reasoning") {
          last.text += text;
        } else {
          assistantParts.push({ type: "reasoning", text });
        }
      };

      const appendText = (text: string) => {
        const last = assistantParts[assistantParts.length - 1];
        if (last?.type === "text") {
          last.text += text;
        } else {
          assistantParts.push({ type: "text", text });
        }
      };

      const parseThink = makeThinkParser();

      // Leaves unfinished tool calls (and their subagent lines) in a final state
      const markInterrupted = () => {
        if (assistantParts.length === 0) return;
        for (const part of assistantParts) {
          if (isToolPart(part) && (part.state === "call" || part.state === "partial-call")) {
            Object.assign(part, { state: "output-error", errorText: "Interrupted" });
          }
        }
        emitAssistant();
      };

      try {
        const resolvedModel = resolveChatModel(model);
        const contracts = getToolContracts(mode);
        const withSubagentSlot = createSemaphore(MAX_CONCURRENT_SUBAGENTS);

        const runTask = async (args: Record<string, unknown>, toolCallId: string) => {
          setActivity(toolCallId, "Waiting…");
          try {
            return await withSubagentSlot(() =>
              runSubagent({
                prompt: String(args.prompt),
                model,
                abortSignal: controller.signal,
                onActivity: (activity) => setActivity(toolCallId, activity),
              }),
            );
          } finally {
            setActivity(toolCallId, null);
          }
        };

        // Tools with execute so each streamText call closes after one step.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolsWithExecute = Object.fromEntries(
          Object.entries(contracts).map(([name, contract]) => [
            name,
            {
              description: contract.description,
              inputSchema: contract.inputSchema,
              execute: async (
                args: Record<string, unknown>,
                { toolCallId }: { toolCallId: string },
              ) => {
                try {
                  return name === "task"
                    ? await runTask(args, toolCallId)
                    : await executeLocalTool(name, args, mode);
                } catch (err) {
                  return { _toolError: err instanceof Error ? err.message : String(err) };
                }
              },
            },
          ]),
        );

        setStatus("streaming");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = streamText({
          model: resolvedModel.model,
          system: buildSystemPrompt({ mode, summary: window.compaction?.summary }),
          messages: [
            ...toModelMessages(window.messages),
            { role: "user" as const, content: userText },
          ],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: toolsWithExecute as any,
          // End the turn early if the context fills up; it's compacted below
          stopWhen: [
            stepCountIs(50),
            ({ steps }) => isOverThreshold(contextTokensOf(steps.at(-1)?.usage), contextWindow),
          ],
          abortSignal: controller.signal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          providerOptions: resolvedModel.providerOptions as any,
        });

        for await (const part of result.fullStream) {
          if (controller.signal.aborted) break;

          if (part.type === "reasoning-delta") {
            appendReasoning(part.text);
            emitAssistant();
          }

          if (part.type === "text-delta") {
            const { reasoning, text } = parseThink(part.text);
            if (reasoning) appendReasoning(reasoning);
            if (text) appendText(text);
            emitAssistant();
          }

          if (part.type === "tool-call") {
            assistantParts.push({
              type: `tool-${part.toolName}` as `tool-${string}`,
              toolCallId: part.toolCallId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input: (part as any).input as Record<string, unknown>,
              state: "call",
            });
            emitAssistant();
          }

          if (part.type === "tool-result") {
            const toolPart = assistantParts.find(
              (p): p is ToolPart => isToolPart(p) && p.toolCallId === part.toolCallId,
            );
            if (toolPart) {
              const out = part.output as Record<string, unknown> | null;
              if (out && "_toolError" in out) {
                Object.assign(toolPart, { state: "output-error", errorText: String(out._toolError) });
              } else {
                Object.assign(toolPart, { state: "output-available", output: out });
              }
            }
            emitAssistant();
          }

          if (part.type === "finish-step") {
            lastContextTokens = contextTokensOf(part.usage);
            emitAssistant();
          }
        }

        if (controller.signal.aborted) {
          markInterrupted();
          return;
        }

        emitAssistant(Date.now() - startTime);
        await saveSessionMessages(sessionId, entriesRef.current);

        if (lastContextTokens != null && isOverThreshold(lastContextTokens, contextWindow)) {
          await runCompaction(model, "auto", controller.signal);
        }

        if (!controller.signal.aborted) setStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) {
          markInterrupted();
          return;
        }
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus("error");
      } finally {
        if (isCurrent()) busyRef.current = false;
      }
    },
    [sessionId, setEntries, runCompaction, setActivity],
  );

  return {
    entries,
    activeWindow,
    contextTokens,
    subagentActivity,
    status,
    error,
    submit,
    compact,
    abort,
    interrupt,
  };
}
