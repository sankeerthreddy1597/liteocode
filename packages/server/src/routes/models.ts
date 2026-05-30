import { Hono } from "hono";

const ollamaHost = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1").replace(
  /\/v1\/?$/,
  "",
);

const app = new Hono().get("/ollama", async (c) => {
  try {
    const res = await fetch(`${ollamaHost}/api/tags`);
    if (!res.ok) return c.json({ models: [] });
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => `ollama:${m.name}`);
    return c.json({ models });
  } catch {
    return c.json({ models: [] });
  }
});

export default app;
