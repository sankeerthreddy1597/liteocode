import { join } from "path";
import { homedir } from "os";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import type { Message } from "../hooks/use-chat";

const SESSIONS_DIR = join(homedir(), ".litecode", "sessions");

export type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};

export type SessionSummary = Omit<Session, "messages">;

async function ensureSessionsDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string) {
  return join(SESSIONS_DIR, `${id}.json`);
}

export async function createSession(title: string): Promise<Session> {
  await ensureSessionsDir();
  const session: Session = {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  await writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
  return session;
}

export async function loadSession(id: string): Promise<Session | null> {
  try {
    const content = await readFile(sessionPath(id), "utf-8");
    return JSON.parse(content) as Session;
  } catch {
    return null;
  }
}

export async function saveSessionMessages(id: string, messages: Message[]): Promise<void> {
  try {
    const session = await loadSession(id);
    if (!session) return;
    session.messages = messages;
    session.updatedAt = new Date().toISOString();
    await writeFile(sessionPath(id), JSON.stringify(session, null, 2), "utf-8");
  } catch {
    // Best-effort save
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  await ensureSessionsDir();
  let files: string[];
  try {
    files = await readdir(SESSIONS_DIR);
  } catch {
    return [];
  }

  const sessions: SessionSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await readFile(join(SESSIONS_DIR, file), "utf-8");
      const { id, title, createdAt, updatedAt } = JSON.parse(content) as Session;
      sessions.push({ id, title, createdAt, updatedAt });
    } catch {
      // Skip corrupted files
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
