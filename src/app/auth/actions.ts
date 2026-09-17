"use server";

import { redirect } from "next/navigation";
import { exchangeLoginCode } from "@/server/login";
import { startSession } from "@/server/session";

export async function loginAction(formData: FormData) {
  const code = formData.get("code");
  const token = typeof code === "string" ? await exchangeLoginCode(code) : null;
  if (!token) redirect("/login?expired=1");
  await startSession(token);
  redirect("/");
}
