import { useParams } from "react-router";

export function Session() {
  const { id } = useParams();
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
      <text>Session {id}</text>
    </box>
  );
}
