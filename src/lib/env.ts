import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  DEPARTMENT_CHAT_ID: z.string().optional().default(""),
  DEPARTMENT_THREAD_ID: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_IDS: z.string().optional().default(""),
  APP_URL: z.string().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);

export const bootstrapAdminIds = env.BOOTSTRAP_ADMIN_IDS.split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => BigInt(s));
