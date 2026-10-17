import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-8 w-48 bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl bg-surface-2" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl bg-surface-2" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl bg-surface-2" />
        <Skeleton className="h-80 rounded-xl bg-surface-2" />
        <Skeleton className="h-80 rounded-xl bg-surface-2" />
      </div>
    </div>
  );
}
