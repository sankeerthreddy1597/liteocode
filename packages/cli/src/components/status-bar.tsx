import { TextAttributes } from "@opentui/core";

export function StatusBar() {
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <text fg="gray" attributes={TextAttributes.DIM}>
        Shift + Tab to change mode
      </text>
      <box flexDirection="row" gap={1}>
        <text fg="cyan">Build</text>
        <text attributes={TextAttributes.DIM} fg="gray">
          &gt;
        </text>
        <text>opus-4.6</text>
      </box>
    </box>
  );
}
