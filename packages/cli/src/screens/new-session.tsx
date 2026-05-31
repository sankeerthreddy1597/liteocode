import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { modeSchema } from "@litecode/shared";
import { useNavigate, useLocation } from "react-router";
import { SessionShell } from "../components/session-shell";
import { UserMessage } from "../components/messages";
import { useToast } from "../providers/toast";
import { createSession } from "../lib/sessions";

const newSessionStateSchema = z.object({
  message: z.string(),
  mode: modeSchema,
  model: z.string(),
});

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const hasStartedRef = useRef(false);

  const state = useMemo(() => {
    const parsed = newSessionStateSchema.safeParse(location.state);
    return parsed.success ? parsed.data : null;
  }, [location.state]);

  useEffect(() => {
    if (!state) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  useEffect(() => {
    if (!state || hasStartedRef.current) return;
    hasStartedRef.current = true;

    let ignore = false;
    const start = async () => {
      try {
        const session = await createSession(state.message.slice(0, 100));
        if (ignore) return;
        navigate(`/sessions/${session.id}`, {
          replace: true,
          state: { session, initialPrompt: state },
        });
      } catch (error) {
        if (ignore) return;
        toast.show({
          variant: "error",
          message: error instanceof Error ? error.message : "Failed to create session",
        });
        navigate("/", { replace: true });
      }
    };

    void start();
    return () => {
      ignore = true;
    };
  }, [state, navigate, toast]);

  if (!state) return null;

  return (
    <SessionShell onSubmit={() => {}} inputDisabled loading>
      <UserMessage message={state.message} mode={state.mode} />
    </SessionShell>
  );
}
