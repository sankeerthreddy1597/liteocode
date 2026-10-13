import { z } from "zod";
import { tool } from "ai";

export const Mode = {
  BUILD: "BUILD",
  PLAN: "PLAN",
} as const;

export const modeSchema = z.enum([Mode.BUILD, Mode.PLAN]);

export type ModeType = (typeof Mode)[keyof typeof Mode];

export const toolInputSchemas = {
  readFile: z.object({
    path: z.string().describe("Relative path to the file to read"),
  }),
  listDirectory: z.object({
    path: z.string().default(".").describe("Relative directory path to list"),
  }),
  glob: z.object({
    pattern: z.string().describe("Glob pattern to match files"),
    path: z.string().default(".").describe("Directory to search from"),
  }),
  grep: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z.string().default(".").describe("Directory to search from"),
    include: z
      .string()
      .optional()
      .describe("Optional glob for files to include"),
  }),
  writeFile: z.object({
    path: z.string().describe("Relative path to write"),
    content: z.string().describe("File contents"),
  }),
  editFile: z.object({
    path: z.string().describe("Relative path to edit"),
    oldString: z.string().describe("Exact text to replace; must be unique"),
    newString: z.string().describe("Replacement text"),
  }),
  bash: z.object({
    command: z.string().describe("Shell command to run"),
    description: z
      .string()
      .optional()
      .describe("Short description of the command"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  task: z.object({
    description: z
      .string()
      .describe("Short (3-6 word) label for the task, shown to the user"),
    prompt: z
      .string()
      .describe(
        "Complete, self-contained instructions for the subagent. It cannot see this conversation, so include all relevant context, file paths and what to report back.",
      ),
  }),
} as const;

export const readOnlyToolContracts = {
  readFile: tool({
    description: "Read a file from the current project directory.",
    inputSchema: toolInputSchemas.readFile,
  }),
  listDirectory: tool({
    description:
      "List entries in a directory under the current project directory.",
    inputSchema: toolInputSchemas.listDirectory,
  }),
  glob: tool({
    description:
      "Find files matching a glob pattern under the current project directory.",
    inputSchema: toolInputSchemas.glob,
  }),
  grep: tool({
    description:
      "Search file contents with a regular expression under the current project directory.",
    inputSchema: toolInputSchemas.grep,
  }),
} as const;

// Subagents get the read-only tools only, so they can't spawn further subagents
export const subagentToolContracts = readOnlyToolContracts;

const taskToolContract = tool({
  description:
    "Launch a read-only subagent for a long research task: exploring an unfamiliar area of the repo, tracing a bug across files, or building an overview. It works in its own context and returns only a final report, keeping your context small. Up to 4 can run in parallel when you call this tool several times in one step; call them one at a time when a task depends on another's result. Don't use it for simple lookups you can do with one or two tool calls.",
  inputSchema: toolInputSchemas.task,
});

const planToolContracts = {
  ...readOnlyToolContracts,
  task: taskToolContract,
} as const;

export const buildToolContracts = {
  ...readOnlyToolContracts,
  task: taskToolContract,
  writeFile: tool({
    description:
      "Create or overwrite a file under the current project directory.",
    inputSchema: toolInputSchemas.writeFile,
  }),
  editFile: tool({
    description:
      "Replace exact text in a file under the current project directory.",
    inputSchema: toolInputSchemas.editFile,
  }),
  bash: tool({
    description: "Run a shell command in the current project directory.",
    inputSchema: toolInputSchemas.bash,
  }),
} as const;

export type ToolContracts = typeof buildToolContracts;

export function getToolContracts(mode: ModeType) {
  return mode === Mode.PLAN ? planToolContracts : buildToolContracts;
}
