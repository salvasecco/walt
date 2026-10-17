import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="glass rounded-3xl p-10">
        <p className="font-mono text-5xl font-semibold text-cyan-neon">404</p>
        <p className="mt-3 text-lg">No encontramos eso.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          Volver a En vivo
        </Link>
      </div>
    </main>
  );
}
