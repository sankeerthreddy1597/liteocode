import { generateText, stepCountIs, streamText } from "ai";
import { Mode, subagentToolContracts, type AnyChatModelId } from "@litecode/shared";
import { getContextWindow, resolveChatModel } from "./models";
import { executeLocalTool } from "./local-tools";
import { stripThinkTags } from "./compaction";
import { formatToolInput, formatToolName } from "./format-tool";

export const MAX_CONCURRENT_SUBAGENTS = 4;

const MAX_STEPS = 30;
// Past this fraction of the window the subagent is told to stop and report
const WRAP_UP_RATIO = 0.6;
const MAX_FALLBACK_TOOL_OUTPUT = 2_000;
const CHARS_PER_TOKEN = 4;

const SUBAGENT_SYSTEM_PROMPT = `You are a research subagent working for a coding assistant inside a terminal application. You have been given one task. Complete it using your read-only tools, then reply with a final report.

## Tools
- **readFile** — Read a file's contents
- **listDirectory** — List entries in a directory
- **glob** — Find files matching a pattern (e.g. "**/*.ts")
- **grep** — Search file contents with regex

You cannot modify files or run commands.

## Rules
1. **Be decisive.** Use glob/grep to find what's relevant, then read only those files.
2. **Batch your tool calls.** Call multiple tools in parallel when possible.
3. **Your final message is the only thing the assistant will see.** Make it a self-contained report: lead with the direct answer, then the supporting details with exact file paths, line numbers, function names and short code excerpts where they matter. Leave out the steps you took to find things.`;

export type SubagentResult = {
  result: string;
  toolCalls: number;
};

export type Semaphore = <T>(task: () => Promise<T>) => Promise<T>;

// Runs at most `limit` tasks at once; the rest wait in order
export function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const queue: (() => void)[] = [];

  return async (task) => {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n... (truncated)` : value;
}

export async function runSubagent({
  prompt,
  model,
  abortSignal,
  onActivity,
}: {
  prompt: string;
  model: AnyChatModelId;
  abortSignal?: AbortSignal;
  onActivity: (activity: string) => void;
}): Promise<SubagentResult> {
  const resolvedModel = resolveChatModel(model);
  const contextWindow = getContextWindow(model);

  const tools = Object.fromEntries(
    Object.entries(subagentToolContracts).map(([name, contract]) => [
      name,
      {
        description: contract.description,
        inputSchema: contract.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          try {
            return await executeLocalTool(name, args, Mode.PLAN);
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
      },
    ]),
  );

  onActivity("Starting…");

  const result = streamText({
    model: resolvedModel.model,
    system: SUBAGENT_SYSTEM_PROMPT,
    prompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: stepCountIs(MAX_STEPS),
    // Ask for the final report on the last step or when the context fills up
    prepareStep: ({ stepNumber, steps }) => {
      const usage = steps.at(-1)?.usage;
      const contextTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      if (stepNumber >= MAX_STEPS - 1 || contextTokens >= contextWindow * WRAP_UP_RATIO) {
        return { toolChoice: "none" };
      }
      return undefined;
    },
    abortSignal,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions: resolvedModel.providerOptions as any,
  });

  // Only the text of the last step is the report; earlier text is preamble
  let stepText = "";
  let toolCalls = 0;

  for await (const part of result.fullStream) {
    if (part.type === "start-step") stepText = "";
    if (part.type === "reasoning-start") onActivity("Thinking…");
    if (part.type === "text-start") onActivity("Writing report…");
    if (part.type === "text-delta") stepText += part.text;
    if (part.type === "tool-call") {
      toolCalls++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = (part as any).input;
      onActivity(`${formatToolName(part.toolName)}: ${formatToolInput(input)}`);
    }
    if (part.type === "error") throw part.error;
  }

  // An aborted stream ends without throwing
  abortSignal?.throwIfAborted();

  let report = stripThinkTags(stepText);

  // Some providers (Ollama) ignore toolChoice, so the subagent can run out of
  // steps mid-search. Write the report from its findings in one tool-free call.
  if (!report) {
    onActivity("Writing report…");
    const findings = (await result.steps)
      .flatMap((step) => [
        step.text.trim(),
        ...step.toolResults.map(
          (r) =>
            `[${r.toolName}] ${JSON.stringify(r.input)}\n→ ${truncate(JSON.stringify(r.output), MAX_FALLBACK_TOOL_OUTPUT)}`,
        ),
      ])
      .filter(Boolean)
      .join("\n\n")
      // Keep the most recent findings if they don't fit
      .slice(-contextWindow * WRAP_UP_RATIO * CHARS_PER_TOKEN);

    const { text } = await generateText({
      model: resolvedModel.model,
      system: SUBAGENT_SYSTEM_PROMPT,
      prompt: `## Task\n${prompt}\n\n## What you found\n${findings}\n\nYou have run out of tool calls. Write your final report now from what you found.`,
      abortSignal,
    });
    report = stripThinkTags(text);
  }

  if (!report) throw new Error("Subagent finished without a report");
  return { result: report, toolCalls };
}
