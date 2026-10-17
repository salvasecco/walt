import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-9 w-56 bg-white/5" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl bg-white/5" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl bg-white/5" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl bg-white/5" />
        <Skeleton className="h-80 rounded-2xl bg-white/5" />
        <Skeleton className="h-80 rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
