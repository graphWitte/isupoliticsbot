import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Заводит суперадминов из BOOTSTRAP_ADMIN_IDS заранее, чтобы в админку можно
// было попасть до первого сообщения боту. Имя подтянется при первом контакте.
const prisma = new PrismaClient();

const ids = (process.env.BOOTSTRAP_ADMIN_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

for (const id of ids) {
  const telegramId = BigInt(id);
  await prisma.user.upsert({
    where: { telegramId },
    update: { role: "ADMIN" },
    create: { telegramId, firstName: "Админ", role: "ADMIN" },
  });
  console.log(`[seed] ADMIN: ${id}`);
}

await prisma.$disconnect();
