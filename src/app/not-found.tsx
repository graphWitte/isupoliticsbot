import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <div className="text-4xl">🕳</div>
        <h1 className="mt-3 text-xl font-semibold">Такого тут нет</h1>
        <p className="mt-1 text-sm text-muted">Возможно, квест удалили или ссылка с опечаткой.</p>
        <Link href="/" className={`${btn.secondary} mt-6`}>
          На доску
        </Link>
      </div>
    </main>
  );
}
