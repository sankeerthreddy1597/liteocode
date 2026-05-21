import type { KeyBinding } from "@opentui/core";
import { StatusBar } from "./status-bar";
import { EmptyBorder } from "./border";

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export const TEXTAREA_KEY_BINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "enter", shift: true, action: "newline" },
  { name: "enter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
];

export function InputBar({ onSubmit, disabled }: Props) {
  return (
    <box width="100%" alignItems="center">
      <box
        border={["left"]}
        borderColor="cyan"
        customBorderChars={{
          ...EmptyBorder,
          vertical: "┃",
          bottomLeft: "╹",
        }}
        width="100%"
      >
        <box
          position="relative"
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          backgroundColor="#1A1A24"
          width="100%"
          gap={1}
        >
          <textarea
            focused={!disabled}
            keyBindings={TEXTAREA_KEY_BINDINGS}
            placeholder={`Ask anything..."Fix a bug in my code"`}
          />
          <StatusBar />
        </box>
      </box>
    </box>
  );
}
