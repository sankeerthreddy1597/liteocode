import prettyMs from "pretty-ms";
import { useState } from "react";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type { Message } from "../../hooks/use-chat";
import { Mode, type ModeType } from "@litecode/shared";
import { TextAttributes } from "@opentui/core";
import { formatToolInput, formatToolName } from "../../lib/format-tool";

type ThinkingProps = {
  reasoning: string;
  active: boolean;
};

function ThinkingSection({ reasoning, active }: ThinkingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { colors } = useTheme();

  return (
    <box paddingX={3} paddingBottom={1} width="100%">
      <box flexDirection="row" gap={1} onMouseDown={() => setIsOpen((v) => !v)}>
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          {isOpen ? "▼" : "▶"}
        </text>
        <text attributes={TextAttributes.DIM}>
          {active ? "Thinking..." : "Thinking"}
        </text>
      </box>
      {isOpen && (
        <box paddingTop={1} paddingLeft={2} width="100%">
          <text attributes={TextAttributes.DIM}>{reasoning}</text>
        </box>
      )}
    </box>
  );
}

type ClientMessagePart = Message["parts"][number];
type ToolPart = Extract<ClientMessagePart, { type: `tool-${string}` }>;

type Props = {
  parts: ClientMessagePart[];
  model: string;
  mode: ModeType;
  durationMs?: number;
  streaming?: boolean;
  // Live status of running subagents, keyed by task tool call id
  subagentActivity?: Record<string, string>;
};

function isToolPart(part: ClientMessagePart): part is ToolPart {
  return part.type.startsWith("tool-");
}

function isPending(part: ToolPart) {
  return part.state !== "output-available" && part.state !== "output-error";
}

// A subagent is always exactly one line: its label plus whatever it's doing now
function subagentStatus(part: ToolPart, activity: string | undefined): string {
  if (part.state === "output-error") return part.errorText;
  if (part.state === "output-available") {
    const toolCalls = (part.output as { toolCalls?: number } | null)?.toolCalls;
    return toolCalls != null ? `Done (${toolCalls} tool calls)` : "Done";
  }
  return activity ?? "…";
}

type PartGroup = {
  type: ClientMessagePart["type"];
  parts: ClientMessagePart[];
  key: string;
};

function groupConsecutiveParts(parts: ClientMessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      const key = isToolPart(part)
        ? `group-tc-${part.toolCallId}`
        : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }

  return groups;
}

export function BotMessage({
  parts,
  model,
  mode,
  durationMs,
  streaming = false,
  subagentActivity,
}: Props) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group, i) => (
        <box key={group.key} width="100%" paddingTop={i === 0 ? 0 : 1}>
          {group.parts.map((part, j) => {
            const reasoningActive = streaming && part.type === "reasoning";
            if (part.type === "reasoning") {
              return (
                <ThinkingSection
                  key={`reasoning-${j}`}
                  reasoning={part.text}
                  active={reasoningActive}
                />
              );
            }

            if (isToolPart(part) && part.type === "tool-task") {
              return (
                <box
                  key={part.toolCallId}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  height={1}
                  overflow="hidden"
                  paddingX={2}
                  flexDirection="row"
                  gap={1}
                >
                  <text
                    fg={
                      part.state === "output-error"
                        ? colors.error
                        : isPending(part)
                          ? colors.thinkingBorder
                          : colors.success
                    }
                  >
                    ◉
                  </text>
                  <text wrapMode="none" flexShrink={0}>
                    Agent: {String(part.input.description ?? "")}
                  </text>
                  <text attributes={TextAttributes.DIM} fg={colors.dimSeparator} flexShrink={0}>
                    ›
                  </text>
                  <text attributes={TextAttributes.DIM} wrapMode="none" flexShrink={1}>
                    {subagentStatus(part, subagentActivity?.[part.toolCallId])}
                  </text>
                </box>
              );
            }

            if (isToolPart(part)) {
              const toolName = part.type.slice("tool-".length);
              return (
                <box
                  key={part.toolCallId}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                  flexDirection="row"
                  gap={1}
                >
                  <text
                    attributes={TextAttributes.DIM}
                    fg={isPending(part) ? colors.thinkingBorder : colors.success}
                  >
                    ◉
                  </text>
                  <text attributes={TextAttributes.DIM}>
                    <em attributes={TextAttributes.ITALIC}>
                      {formatToolName(toolName)}:
                    </em>{" "}
                    {formatToolInput(part.input)}
                    {isPending(part) ? " …" : ""}
                    {part.state === "output-error" ? ` ${part.errorText}` : ""}
                  </text>
                </box>
              );
            }

            if (part.type === "text") {
              return (
                <box key={`text-${j}`} paddingX={3} width="100%">
                  <text>{part.text}</text>
                </box>
              );
            }

            return null;
          })}
        </box>
      ))}

      <box paddingX={3} paddingY={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
            ◉
          </text>
          <box flexDirection="row" gap={1}>
            <text>{mode === Mode.PLAN ? "Plan" : "Build"}</text>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {durationMs != null && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  ›
                </text>
                <text attributes={TextAttributes.DIM}>
                  {prettyMs(durationMs)}
                </text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}
