import { prisma } from "@/lib/prisma";

export type DepartmentChat = {
  chatId: string; // строкой: id супергрупп не влезают в JSON-число без потерь
  threadId: number | null;
  title: string;
};

const DEPARTMENT_CHAT = "department_chat";

export async function getDepartmentChat(): Promise<DepartmentChat | null> {
  const row = await prisma.setting.findUnique({ where: { key: DEPARTMENT_CHAT } });
  return (row?.value as DepartmentChat | undefined) ?? null;
}

export async function setDepartmentChat(chat: DepartmentChat) {
  await prisma.setting.upsert({
    where: { key: DEPARTMENT_CHAT },
    update: { value: chat },
    create: { key: DEPARTMENT_CHAT, value: chat },
  });
}
