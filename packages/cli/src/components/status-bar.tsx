import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@litecode/shared";
import { useChatSession } from "../providers/chat-session";
import { getContextWindow } from "../lib/models";

export function StatusBar() {
  const { mode, model } = usePromptConfig();
  const { colors } = useTheme();
  const { session } = useChatSession();
  const contextPercent = session?.contextTokens
    ? Math.min(100, Math.round((session.contextTokens / getContextWindow(model)) * 100))
    : null;

  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
        Shift + Tab to change mode
      </text>
      <box flexDirection="row" gap={1}>
        <text fg={mode === Mode.PLAN ? colors.planMode : colors.primary}>
          {mode === Mode.PLAN ? "Plan" : "Build"}
        </text>
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          &gt;
        </text>
        <text>{model}</text>
        {contextPercent != null && (
          <>
            <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
              &gt;
            </text>
            <text attributes={TextAttributes.DIM}>{contextPercent}% context</text>
          </>
        )}
      </box>
    </box>
  );
}
