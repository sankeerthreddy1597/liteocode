import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import type { CompactionEntry } from "../../hooks/use-chat";

type Props = {
  entry: CompactionEntry;
};

function formatTokens(tokens: number) {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

export function CompactionMessage({ entry }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { colors } = useTheme();

  const details = [
    entry.trigger === "auto" ? "auto" : "manual",
    entry.tokensBefore ? `${formatTokens(entry.tokensBefore)} tokens summarized` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <box paddingX={3} paddingBottom={1} width="100%">
      <box flexDirection="row" gap={1} onMouseDown={() => setIsOpen((v) => !v)}>
        <text attributes={TextAttributes.DIM} fg={colors.dimSeparator}>
          {isOpen ? "▼" : "▶"}
        </text>
        <text fg={colors.info}>Conversation compacted</text>
        <text attributes={TextAttributes.DIM}>({details})</text>
      </box>
      {entry.trigger === "auto" && (
        <box paddingLeft={2}>
          <text attributes={TextAttributes.DIM}>
            Context limit reached; earlier messages were summarized.
          </text>
        </box>
      )}
      {isOpen && (
        <box paddingTop={1} paddingLeft={2} width="100%">
          <text attributes={TextAttributes.DIM}>{entry.summary}</text>
        </box>
      )}
    </box>
  );
}
