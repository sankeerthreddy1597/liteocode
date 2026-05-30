import { useState } from "react";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type {
  ClientMessagePart,
  ClientToolCallPart,
} from "../../hooks/use-chat";
import { Mode } from "@litecode/database/enums";
import { TextAttributes } from "@opentui/core";

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

type Props = {
  parts: ClientMessagePart[];
  reasoning?: string;
  model: string;
  mode: Mode;
  duration?: string;
  streaming?: boolean;
  interrupted?: boolean;
};

function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatToolArgs(tc: ClientToolCallPart): string {
  return Object.values(tc.args).map(String).join(" ");
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
      const key =
        part.type === "tool-call"
          ? `group-tc-${part.id}`
          : `group-${part.type}-${i}`;
      groups.push({ type: part.type, parts: [part], key });
    }
  }

  return groups;
}

export function BotMessage({
  parts,
  reasoning,
  model,
  mode,
  duration,
  streaming = false,
  interrupted = false,
}: Props) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      {groupConsecutiveParts(parts).map((group) => (
        <box key={group.key} paddingY={1} width="100%">
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

            if (part.type === "tool-call") {
              return (
                <box
                  key={part.id}
                  border={["left"]}
                  borderColor={colors.thinkingBorder}
                  customBorderChars={{
                    ...EmptyBorder,
                    vertical: "│",
                  }}
                  width="100%"
                  paddingX={2}
                >
                  <text attributes={TextAttributes.DIM}>
                    <em fg={colors.info}>{formatToolName(part.name)}:</em>{" "}
                    {formatToolArgs(part)}
                    {part.status === "calling" ? " …" : ""}
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

      <box paddingX={3} paddingBottom={1} gap={1} width="100%">
        <box flexDirection="row" gap={2}>
          <text
            attributes={interrupted ? TextAttributes.DIM : 0}
            fg={
              interrupted
                ? undefined
                : mode === Mode.PLAN
                  ? colors.planMode
                  : colors.primary
            }
          >
            ◉
          </text>

          <box flexDirection="row" gap={1}>
            <text attributes={interrupted ? TextAttributes.DIM : 0}>
              {mode === Mode.PLAN ? "Plan" : "Build"}
            </text>

            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              ›
            </text>
            <text attributes={TextAttributes.DIM}>{model}</text>
            {(duration || interrupted) && (
              <>
                <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
                  ›
                </text>
                <text attributes={TextAttributes.DIM}>
                  {interrupted ? "interrupted" : duration}
                </text>
              </>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}
