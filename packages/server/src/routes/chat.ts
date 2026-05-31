import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
  type InferUITools,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { db } from "@litecode/database/client";
import type { Prisma } from "@litecode/database";
import {
  getToolContracts,
  modeSchema,
  type ModeType,
  type ToolContracts,
  isOllamaModelId,
} from "@litecode/shared";
import { buildSystemPrompt } from "../system-prompt";
import { isSupportedChatModel, resolveChatModel } from "../lib/models";

type ChatMessageMetadata = {
  mode?: ModeType;
  model?: string;
  durationMs?: number;
  usage?: LanguageModelUsage;
};

type NightcodeUIMessage = UIMessage<
  ChatMessageMetadata,
  never,
  InferUITools<ToolContracts>
>;

const submitSchema = z.object({
  id: z.string(),
  messages: z
    .array(
      z.custom<NightcodeUIMessage>((value) => {
        return (
          value != null &&
          typeof value === "object" &&
          "id" in value &&
          "parts" in value
        );
      }),
    )
    .min(1),
  mode: modeSchema,
  model: z
    .string()
    .refine(
      (id) => isSupportedChatModel(id) || isOllamaModelId(id),
      "Unsupported model",
    ),
});

const submitValidator = zValidator("json", submitSchema, (result, c) => {
  if (!result.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
});

function hasPendingToolCalls(message: NightcodeUIMessage) {
  return message.parts.some((part) => {
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
      const state = (part as { state?: string }).state;
      return state !== "output-available" && state !== "output-error";
    }

    return false;
  });
}

const app = new Hono().post("/", submitValidator, async (c) => {
  const { id, messages, mode, model } = c.req.valid("json");

  const session = await db.session.findUnique({
    where: { id },
  });

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const startTime = Date.now();
  const tools = getToolContracts(mode);
  const resolvedModel = resolveChatModel(model);
  const previousMessages = Array.isArray(session.messages)
    ? (session.messages as unknown as NightcodeUIMessage[])
    : [];
  const mergedMessages = [...previousMessages];

  for (const message of messages) {
    const incomingMessage = {
      ...message,
      metadata: { ...message.metadata, mode, model },
    } satisfies NightcodeUIMessage;

    const existingMessageIndex = mergedMessages.findIndex(
      (m) => m.id === incomingMessage.id,
    );

    if (existingMessageIndex === -1) {
      mergedMessages.push(incomingMessage);
    } else {
      mergedMessages[existingMessageIndex] = incomingMessage;
    }
  }

  const nextMessages = await validateUIMessages<NightcodeUIMessage>({
    messages: mergedMessages,
    tools,
  });
  const modelMessages = await convertToModelMessages(nextMessages, { tools });

  const result = streamText({
    model: resolvedModel.model,
    system: buildSystemPrompt({ mode }),
    messages: modelMessages,
    tools,
    providerOptions: resolvedModel.providerOptions,
  });

  return result.toUIMessageStreamResponse<NightcodeUIMessage>({
    originalMessages: nextMessages,
    messageMetadata({ part }) {
      if (part.type === "start") {
        return { mode, model };
      }

      if (part.type !== "finish") return undefined;

      return {
        mode,
        model,
        durationMs: Date.now() - startTime,
      };
    },
    async onFinish(event) {
      if (event.isAborted) return;

      if (hasPendingToolCalls(event.responseMessage)) return;

      await db.session.update({
        where: { id },
        data: {
          messages: event.messages as unknown as Prisma.InputJsonValue,
        },
      });
    },
    onError(error) {
      return error instanceof Error ? error.message : String(error);
    },
  });
});

export default app;
