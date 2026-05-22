import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

export function NewSession() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { message?: string } | null;

  useEffect(() => {
    if (!state?.message) {
      navigate("/", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.message) return null;

  return (
    <box
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      gap={2}
      position="relative"
      width="100%"
      height="100%"
    >
      <text>New session started with message:</text>
      <text>{state.message}</text>
    </box>
  );
}
