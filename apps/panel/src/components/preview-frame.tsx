import { applyChangesPreview } from "@/lib/labels";
import type { ContentVersion, DaleRequest } from "@/lib/types";
import { SiteMock } from "./site-mock";

/** Vista previa de un pedido: captura si existe; si no, el sitio con ?preview=; si no, el contenido simulado. */
export function PreviewFrame({
  request,
  siteUrl,
  liveVersion,
  screenshot,
  sample,
  className,
}: {
  request: DaleRequest;
  siteUrl: string | null;
  liveVersion: ContentVersion | null;
  screenshot?: string | null;
  sample: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="relative mx-auto h-full w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-white">
        {screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenshot} alt="Captura de la vista previa" className="size-full object-cover object-top" />
        ) : siteUrl && request.draft_version_id && !sample ? (
          <iframe src={`${siteUrl}?preview=${request.draft_version_id}`} title="Vista previa del borrador" className="size-full" loading="lazy" />
        ) : liveVersion?.content ? (
          <SiteMock content={applyChangesPreview(liveVersion.content, request.changes)} highlight={request.changes?.map((c) => c.pointer)} />
        ) : (
          <div className="grid size-full place-items-center bg-[#0A0D15] p-4 text-center text-sm text-muted-foreground">Sin vista previa</div>
        )}
      </div>
    </div>
  );
}
