import { TextAttributes } from "@opentui/core";
import { useTheme } from "../providers/theme";

export function StatusBar() {
  const { colors } = useTheme();
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
        Shift + Tab to change mode
      </text>
      <box flexDirection="row" gap={1}>
        <text fg={colors.primary}>Build</text>
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          &gt;
        </text>
        <text>opus-4.6</text>
      </box>
    </box>
  );
}
