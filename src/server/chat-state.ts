import { prisma } from "@/lib/prisma";

const TTL_MS = 30 * 60_000;

export type ChatAction = "submit" | "reject_note";

export async function setChatState(telegramId: bigint, action: ChatAction, payload: string) {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.chatState.upsert({
    where: { telegramId },
    update: { action, payload, expiresAt },
    create: { telegramId, action, payload, expiresAt },
  });
}

export async function getChatState(telegramId: bigint) {
  const state = await prisma.chatState.findUnique({ where: { telegramId } });
  if (!state || state.expiresAt <= new Date()) return null;
  return { action: state.action as ChatAction, payload: state.payload };
}

export const clearChatState = (telegramId: bigint) =>
  prisma.chatState.deleteMany({ where: { telegramId } });
