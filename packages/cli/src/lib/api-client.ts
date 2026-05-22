import { hc } from "hono/client";
import type { AppType } from "@litecode/server";

export const apiClient = hc<AppType>(
  process.env.API_URL ?? "http://localhost:3000",
);
