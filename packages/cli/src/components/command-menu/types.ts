import type { DialogContextValue } from "../../providers/dialog";
import type { ToastContextValue } from "../../providers/toast";
import type { ModeType, AnyChatModelId } from "@litecode/shared";
import type { CompactResult } from "../../hooks/use-chat";

export type CommandContext = {
  exit: () => void;
  toast: ToastContextValue;
  dialog: DialogContextValue;
  navigate: (path: string) => void;
  mode: ModeType;
  setMode: (mode: ModeType) => void;
  setModel: (model: AnyChatModelId) => void;
  availableModels: AnyChatModelId[];
  // Only set while a session is open
  compact?: () => Promise<CompactResult>;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  action?: (ctx: CommandContext) => void | Promise<void>;
};
