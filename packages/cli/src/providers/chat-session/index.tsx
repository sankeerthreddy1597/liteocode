import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { CompactResult } from "../../hooks/use-chat";

// What the active session screen exposes to app-wide UI (slash commands, status bar)
export type ChatSessionValue = {
  compact: () => Promise<CompactResult>;
  contextTokens: number;
};

type ChatSessionContextValue = {
  session: ChatSessionValue | null;
  setSession: (session: ChatSessionValue | null) => void;
};

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function useChatSession(): ChatSessionContextValue {
  const value = useContext(ChatSessionContext);
  if (!value) {
    throw new Error("useChatSession must be used within a ChatSessionProvider");
  }
  return value;
}

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ChatSessionValue | null>(null);

  return (
    <ChatSessionContext.Provider value={{ session, setSession }}>
      {children}
    </ChatSessionContext.Provider>
  );
}
