import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { useKeyboard } from "@opentui/react";
import { type ModeType, type AnyChatModelId } from "@litecode/shared";
import { SessionShell } from "../components/session-shell";
import { UserMessage, BotMessage, ErrorMessage } from "../components/messages";
import { useToast } from "../providers/toast";
import { useChat } from "../hooks/use-chat";
import { usePromptConfig } from "../providers/prompt-config";
import type { Message } from "../hooks/use-chat";
import { loadSession, type Session } from "../lib/sessions";
import { useKeyboardLayer } from "../providers/keyboard-layer";

const sessionLocationSchema = z.object({
  session: z.custom<Session>(
    (val) => val != null && typeof val === "object" && "id" in val,
  ),
  initialPrompt: z
    .object({
      message: z.string(),
      mode: z.custom<ModeType>(),
      model: z.custom<AnyChatModelId>(),
    })
    .optional(),
});

function ChatMessage({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    const text = msg.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    return <UserMessage message={text} mode={msg.metadata?.mode ?? "BUILD"} />;
  }

  return (
    <BotMessage
      parts={msg.parts}
      model={msg.metadata?.model ?? "unknown"}
      mode={msg.metadata?.mode ?? "BUILD"}
      durationMs={msg.metadata?.durationMs}
      streaming={false}
    />
  );
}

function SessionChat({
  session,
  initialPrompt,
}: {
  session: Session;
  initialPrompt?: { message: string; mode: ModeType; model: AnyChatModelId };
}) {
  const [initialMessages] = useState(() => session.messages as Message[]);
  const { mode, model } = usePromptConfig();
  const { isTopLayer } = useKeyboardLayer();
  const { messages, status, submit, abort, interrupt, error } = useChat(
    session.id,
    initialMessages,
  );
  const hasSubmittedInitialPromptRef = useRef(false);

  useEffect(() => {
    return () => {
      void abort();
    };
  }, [abort]);

  useKeyboard((key) => {
    if (key.name === "escape" && isTopLayer("base") && status === "streaming") {
      key.preventDefault();
      interrupt();
    }
  });

  useEffect(() => {
    if (!initialPrompt || hasSubmittedInitialPromptRef.current) return;
    hasSubmittedInitialPromptRef.current = true;
    void submit({
      userText: initialPrompt.message,
      mode: initialPrompt.mode,
      model: initialPrompt.model,
    });
  }, [initialPrompt, submit]);

  return (
    <SessionShell
      onSubmit={(text) => void submit({ userText: text, mode, model })}
      loading={status === "submitted" || status === "streaming"}
      interruptible={status === "submitted" || status === "streaming"}
    >
      {messages.map((msg) => (
        <ChatMessage key={msg.id} msg={msg} />
      ))}
      {error && <ErrorMessage message={error.message} />}
    </SessionShell>
  );
}

export function Session() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const prefetched = useMemo(() => {
    const parsed = sessionLocationSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  const [session, setSession] = useState<Session | null>(prefetched?.session ?? null);

  useEffect(() => {
    if (prefetched?.session) return;

    setSession(null);
    if (!id) return;

    let ignore = false;
    const fetch = async () => {
      try {
        const resolved = await loadSession(id);
        if (ignore) return;
        if (!resolved) throw new Error("Session not found");
        setSession(resolved);
      } catch (err) {
        if (ignore) return;
        toast.show({
          variant: "error",
          message: err instanceof Error ? err.message : "Failed to load session",
        });
        navigate("/", { replace: true });
      }
    };

    void fetch();
    return () => {
      ignore = true;
    };
  }, [id, prefetched, toast, navigate]);

  if (!session) {
    return <SessionShell onSubmit={() => {}} inputDisabled loading />;
  }

  return (
    <SessionChat
      key={session.id}
      session={session}
      initialPrompt={prefetched?.initialPrompt}
    />
  );
}
