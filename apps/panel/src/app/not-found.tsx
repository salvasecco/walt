import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="rounded-xl border border-line bg-surface p-10">
        <p className="text-5xl font-semibold tracking-tight tnum">404</p>
        <p className="mt-2 text-sm text-muted-foreground">No encontramos eso.</p>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "mt-6 px-3.5" })}>
          Volver a En vivo
        </Link>
      </div>
    </main>
  );
}
