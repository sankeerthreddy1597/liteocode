import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";
import { usePromptConfig } from "../providers/prompt-config";
import { Mode } from "@litecode/database/enums";

export function StatusBar() {
  const { mode, model } = usePromptConfig();
  const { colors } = useTheme();
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
      </box>
    </box>
  );
}
