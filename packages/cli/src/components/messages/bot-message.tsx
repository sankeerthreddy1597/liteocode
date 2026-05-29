import { useState } from "react";
import { EmptyBorder } from "../border";
import { useTheme } from "../../providers/theme";
import type { ClientMessagePart } from "../../hooks/use-chat";
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
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => setIsOpen((v) => !v)}
      >
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
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Reasoning is still active when the model is streaming but no text has arrived yet
  const reasoningActive = streaming && text.length === 0;

  return (
    <box width="100%" alignItems="center">
      {reasoning && (
        <ThinkingSection reasoning={reasoning} active={reasoningActive} />
      )}

      <box paddingY={1} width="100%">
        <box paddingX={3} width="100%">
          <text>{text}</text>
        </box>
      </box>

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
