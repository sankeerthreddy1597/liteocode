export function formatToolName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function formatToolInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object") return String(input);
  return Object.values(input).map(String).join(" ");
}
