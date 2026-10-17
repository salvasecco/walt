import type { Category, Change, Op, OpType, Policy, RequestStatus, SiteContent } from "./types";

export const TZ = "America/Montevideo";

export type Tone = "cyan" | "violet" | "amber" | "emerald" | "rose" | "muted";

export const toneText: Record<Tone, string> = {
  cyan: "text-cyan-neon",
  violet: "text-violet-neon",
  amber: "text-amber-neon",
  emerald: "text-emerald-neon",
  rose: "text-rose-neon",
  muted: "text-muted-foreground",
};

export const toneChip: Record<Tone, string> = {
  cyan: "border-cyan-neon/40 bg-cyan-neon/10 text-cyan-neon",
  violet: "border-violet-neon/40 bg-violet-neon/10 text-violet-neon",
  amber: "border-amber-neon/40 bg-amber-neon/10 text-amber-neon",
  emerald: "border-emerald-neon/40 bg-emerald-neon/10 text-emerald-neon",
  rose: "border-rose-neon/40 bg-rose-neon/10 text-rose-neon",
  muted: "border-white/10 bg-white/5 text-muted-foreground",
};

export const toneHex: Record<Tone, string> = {
  cyan: "#22D3EE",
  violet: "#A78BFA",
  amber: "#FBBF24",
  emerald: "#34D399",
  rose: "#FB7185",
  muted: "#8B93A7",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  permitido: "Permitido",
  riesgoso: "Riesgoso",
  fuera_de_alcance: "Fuera de alcance",
  consulta: "Consulta",
  bloqueado: "Bloqueado",
  charla: "Charla",
  derivado: "Derivado",
};

export const CATEGORY_TONE: Record<Category, Tone> = {
  permitido: "emerald",
  riesgoso: "amber",
  fuera_de_alcance: "violet",
  consulta: "cyan",
  bloqueado: "rose",
  charla: "muted",
  derivado: "rose",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  recibido: "Recibido",
  interpretando: "Interpretando",
  respondido: "Respondido",
  cotizando: "Cotizando",
  cotizado: "Cotizado",
  esperando_cliente: "Espera al cliente",
  esperando_agencia: "Espera a la agencia",
  agente_trabajando: "Agente trabajando",
  agente_listo: "Agente listo",
  publicando: "Publicando",
  publicado: "Publicado",
  revertido: "Revertido",
  rechazado: "Rechazado",
  bloqueado: "Bloqueado",
  derivado: "Derivado",
  descartado: "Descartado",
  charla: "Charla",
};

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  recibido: "cyan",
  interpretando: "violet",
  respondido: "emerald",
  cotizando: "violet",
  cotizado: "violet",
  esperando_cliente: "amber",
  esperando_agencia: "amber",
  agente_trabajando: "violet",
  agente_listo: "amber",
  publicando: "cyan",
  publicado: "emerald",
  revertido: "muted",
  rechazado: "muted",
  bloqueado: "rose",
  derivado: "rose",
  descartado: "muted",
  charla: "muted",
};

/** Estados en los que el pedido todavía se mueve. */
export const OPEN_STATUSES: RequestStatus[] = [
  "recibido",
  "interpretando",
  "cotizando",
  "esperando_cliente",
  "esperando_agencia",
  "agente_trabajando",
  "agente_listo",
  "publicando",
];

export const STEP_LABEL: Record<string, string> = {
  recibido: "Recibido",
  interpretado: "Interpretado",
  decidido: "Decidido",
  gate: "Gate",
  borrador: "Borrador",
  captura: "Captura",
  enviado: "Enviado",
  aprobado_cliente: "Aprueba cliente",
  aprobado_agencia: "Aprueba agencia",
  publicando: "Publicando",
  publicado: "Publicado",
  commit: "Commit",
  revertido: "Revertido",
  derivado: "Derivado",
  agente_inicio: "Agente",
  agente_pr: "PR",
  agente_preview: "Vista previa",
  presupuesto: "Presupuesto",
  respondido: "Respondido",
  bloqueado: "Bloqueado",
};

export const OP_LABEL: Record<OpType, string> = {
  set_text: "Textos",
  set_price: "Precio de un producto",
  adjust_prices: "Ajuste de precios en lote",
  set_availability: "Disponibilidad",
  set_color: "Colores",
  set_hours: "Horarios",
  set_banner: "Cartel de promoción",
  toggle_section: "Mostrar u ocultar secciones",
};

export const POLICY_LABEL: Record<Policy, string> = {
  auto: "Automático",
  agencia: "Lo aprueba la agencia",
  bloqueado: "Bloqueado",
};

export const POLICY_TONE: Record<Policy, Tone> = {
  auto: "emerald",
  agencia: "amber",
  bloqueado: "rose",
};

const DAY_LABEL: Record<string, string> = {
  lun: "lunes",
  mar: "martes",
  mie: "miércoles",
  jue: "jueves",
  vie: "viernes",
  sab: "sábado",
  dom: "domingo",
};

const TEXT_LABEL: Record<string, string> = {
  "/hero/title": "Título principal",
  "/hero/subtitle": "Subtítulo",
  "/hero/cta": "Texto del botón principal",
  "/brand/tagline": "Frase de la marca",
  "/about/text": "Texto de quiénes somos",
};

const COLOR_LABEL: Record<string, string> = {
  primary: "Color principal",
  accent: "Color de acento",
  background: "Color de fondo",
};

export function money(n: number | null | undefined, currency = "$"): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${currency}${new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 }).format(n)}`;
}

export function usd(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `USD ${n.toFixed(digits)}`;
}

export function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`;
  return `${Math.floor(n / 60_000)} min ${Math.round((n % 60_000) / 1000)} s`;
}

export function clock(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(iso));
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function productName(content: SiteContent | null | undefined, id: string): string {
  return content?.products?.find((p) => p.id === id)?.name ?? id;
}

/** Operación en lenguaje humano. */
export function describeOp(op: Op, content?: SiteContent | null): string {
  switch (op.type) {
    case "set_text":
      return `${TEXT_LABEL[op.path] ?? op.path}: “${op.value}”`;
    case "set_price":
      return `Precio de ${productName(content, op.productId)} a ${money(op.value)}`;
    case "adjust_prices": {
      const who = op.filter.all
        ? "todos los precios"
        : op.filter.category
          ? `los precios de ${op.filter.category}`
          : `${op.filter.productIds?.length ?? 0} productos`;
      const how =
        op.percent != null
          ? `${op.percent > 0 ? "Subo" : "Bajo"} ${Math.abs(op.percent)}%`
          : `${(op.amount ?? 0) > 0 ? "Subo" : "Bajo"} ${money(Math.abs(op.amount ?? 0))}`;
      const round =
        op.rounding === "nearest_5"
          ? ", redondeo a múltiplos de 5"
          : op.rounding === "nearest_10"
            ? ", redondeo a múltiplos de 10"
            : op.rounding === "integer"
              ? ", sin decimales"
              : "";
      return `${how} ${who}${round}`;
    }
    case "set_availability":
      return `${productName(content, op.productId)}: ${op.available ? "disponible" : "sin stock"}`;
    case "set_color":
      return `${COLOR_LABEL[op.token] ?? op.token} a ${op.value}`;
    case "set_banner": {
      if (!op.enabled) return "Saco el cartel";
      const parts = [`Cartel “${op.text ?? ""}”`];
      if (op.discountPercent) parts.push(`${op.discountPercent}% de descuento`);
      if (op.endsAt) parts.push(`hasta el ${dateTime(op.endsAt)}`);
      return parts.join(", ");
    }
    case "set_hours":
      return op.open && op.close
        ? `Horario del ${DAY_LABEL[op.day]}: ${op.open} a ${op.close}`
        : `El ${DAY_LABEL[op.day]} cerrado`;
    case "toggle_section":
      return `${op.visible ? "Muestro" : "Oculto"} la sección ${op.section}`;
  }
}

/** Etiqueta humana para un JSON pointer del contenido. */
export function describePointer(pointer: string, content?: SiteContent | null): string {
  if (TEXT_LABEL[pointer]) return TEXT_LABEL[pointer];
  const parts = pointer.split("/").filter(Boolean);
  if (parts[0] === "products" && parts.length >= 3) {
    const idx = Number(parts[1]);
    const p = content?.products?.[idx];
    const field = parts[2] === "price" ? "precio" : parts[2] === "available" ? "disponible" : parts[2];
    return `${p?.name ?? `Producto ${idx + 1}`} · ${field}`;
  }
  if (parts[0] === "theme") return COLOR_LABEL[parts[1]] ?? `Color ${parts[1]}`;
  if (parts[0] === "banner") return `Cartel · ${parts[1] ?? ""}`.trim();
  if (parts[0] === "hours" && parts.length >= 3) {
    const h = content?.hours?.[Number(parts[1])];
    return `Horario ${h ? DAY_LABEL[h.day] : parts[1]} · ${parts[2] === "open" ? "abre" : "cierra"}`;
  }
  if (parts[0] === "sections") return `Sección ${parts[1]}`;
  return pointer;
}

export function formatValue(v: unknown, pointer = ""): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return pointer.includes("price") ? money(v) : String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function describeChange(c: Change, content?: SiteContent | null) {
  return {
    label: describePointer(c.pointer, content),
    before: formatValue(c.before, c.pointer),
    after: formatValue(c.after, c.pointer),
  };
}
