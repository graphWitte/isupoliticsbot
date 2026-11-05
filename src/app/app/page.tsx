import { env } from "@/lib/env";
import { MiniApp } from "@/components/miniapp/miniapp";

export const dynamic = "force-dynamic";

export default function MiniAppPage() {
  return (
    <div className="tg">
      <MiniApp appUrl={env.APP_URL} />
    </div>
  );
}
