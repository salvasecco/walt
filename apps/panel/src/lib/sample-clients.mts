// Clientes de ejemplo (Ferretería Don Raúl y Estudio Jurídico Pereira): una sola fuente para
// `pnpm seed` (los inserta en Supabase con is_sample = true) y para los datos de ejemplo del panel
// en desarrollo. Sin imports: lo usan tanto Next como los scripts con tsx.
// Los contactos usan chats de Telegram negativos que no existen y no hay contacto de agencia:
// el worker nunca les manda nada.

export const SAMPLE_IDS = {
  clientMabel: "33333333-3333-4333-8333-000000000001",
  clientFerreteria: "33333333-3333-4333-8333-000000000002",
  clientPereira: "33333333-3333-4333-8333-000000000003",
  projectFerreteria: "44444444-4444-4444-8444-000000000002",
  projectPereira: "44444444-4444-4444-8444-000000000003",
  contactFerreteria: "55555555-5555-4555-8555-000000000002",
  contactPereira: "55555555-5555-4555-8555-000000000003",
} as const;

export const SAMPLE_PROJECT_IDS = [SAMPLE_IDS.projectFerreteria, SAMPLE_IDS.projectPereira] as const;

type Key = "ferreteria" | "pereira";
type Status = "publicado" | "esperando_agencia" | "esperando_cliente" | "cotizado" | "derivado";
type Category = "permitido" | "riesgoso" | "fuera_de_alcance" | "derivado";

type ReqSpec = {
  short: string;
  key: Key;
  /** Horas hacia atrás. Los de `thisMonth` se acomodan dentro del mes corriente. */
  hoursAgo: number;
  thisMonth: boolean;
  text: string;
  summary: string;
  status: Status;
  category: Category;
  ops: Record<string, unknown>[];
  changes: { pointer: string; before: unknown; after: unknown }[];
  reasons: string[];
  cost: number;
  error?: string;
  quote?: { title: string; description: string; amount: number; eta: number; status: "borrador" | "enviado" };
};

const SPECS: ReqSpec[] = [
  // Ferretería Don Raúl: un cartel esperando a la agencia hace más de un día y un presupuesto en borrador.
  {
    short: "EJFRA2", key: "ferreteria", hoursAgo: 200, thisMonth: true, status: "publicado", category: "permitido",
    text: "subí el taladro percutor a 4990", summary: "Subo el taladro percutor de $4.590 a $4.990",
    ops: [{ type: "set_price", productId: "taladro-percutor", value: 4990 }],
    changes: [{ pointer: "/products/0/price", before: 4590, after: 4990 }],
    reasons: ["Cambio de precio dentro del límite (9% < 30%)"], cost: 0.0131,
  },
  {
    short: "EJFRB3", key: "ferreteria", hoursAgo: 150, thisMonth: true, status: "publicado", category: "permitido",
    text: "el sábado abrimos de 8 a 13", summary: "El sábado abro de 8:00 a 13:00",
    ops: [{ type: "set_hours", day: "sab", open: "08:00", close: "13:00" }],
    changes: [{ pointer: "/hours/5/close", before: "12:00", after: "13:00" }],
    reasons: ["Horarios: automático"], cost: 0.0122,
  },
  {
    short: "EJFRC4", key: "ferreteria", hoursAgo: 60, thisMonth: true, status: "publicado", category: "permitido",
    text: "sacá la amoladora que no nos queda", summary: "Marco la amoladora angular como sin stock",
    ops: [{ type: "set_availability", productId: "amoladora", available: false }],
    changes: [{ pointer: "/products/3/available", before: true, after: false }],
    reasons: ["Disponibilidad: automático"], cost: 0.0117,
  },
  {
    short: "EJFRD5", key: "ferreteria", hoursAgo: 27, thisMonth: true, status: "esperando_agencia", category: "riesgoso",
    text: "poné un cartel de liquidación: 30% en herramientas hasta fin de mes",
    summary: "Pongo un cartel de liquidación con 30% en herramientas hasta fin de mes",
    ops: [{ type: "set_banner", enabled: true, text: "Liquidación: 30% en herramientas", discountPercent: 30, startsAt: null, endsAt: null }],
    changes: [
      { pointer: "/banner/enabled", before: false, after: true },
      { pointer: "/banner/text", before: "", after: "Liquidación: 30% en herramientas" },
      { pointer: "/banner/discountPercent", before: null, after: 30 },
    ],
    reasons: ["Los carteles de promoción los aprueba la agencia (regla set_banner)"], cost: 0.0176,
  },
  {
    short: "EJFRE6", key: "ferreteria", hoursAgo: 5, thisMonth: true, status: "cotizado", category: "fuera_de_alcance",
    text: "quiero vender online y cobrar con Mercado Pago", summary: "Quiere una tienda online con cobro por Mercado Pago",
    ops: [], changes: [], reasons: [], cost: 0.0298,
    quote: {
      title: "Tienda online con Mercado Pago",
      description: "Catálogo con carrito, cobro con Mercado Pago y aviso de cada venta por WhatsApp. Incluye carga inicial de 50 productos.",
      amount: 900, eta: 15, status: "borrador",
    },
  },
  {
    short: "EJFRF7", key: "ferreteria", hoursAgo: 24 * 38, thisMonth: false, status: "publicado", category: "permitido",
    text: "cambiá el teléfono de arriba por el 2401 5566", summary: "Cambio el teléfono del encabezado",
    ops: [{ type: "set_text", path: "/hero/cta", value: "Llamanos al 2401 5566" }],
    changes: [{ pointer: "/hero/cta", before: "Llamanos al 2401 1234", after: "Llamanos al 2401 5566" }],
    reasons: ["Textos: automático"], cost: 0.0109,
  },
  {
    short: "EJFRG8", key: "ferreteria", hoursAgo: 24 * 70, thisMonth: false, status: "publicado", category: "permitido",
    text: "bajá 10% las mechas", summary: "Bajo 10% los precios de mechas",
    ops: [{ type: "adjust_prices", filter: { category: "mechas" }, percent: -10, rounding: "integer" }],
    changes: [{ pointer: "/products/5/price", before: 320, after: 288 }],
    reasons: ["Ajuste del 10%, dentro del límite de 30%"], cost: 0.0126,
  },
  // Estudio Jurídico Pereira: espera al cliente; el derivado ya se resolvió con un pedido publicado después.
  {
    short: "EJPEA2", key: "pereira", hoursAgo: 180, thisMonth: true, status: "publicado", category: "permitido",
    text: "cambiá el horario de atención: lunes a viernes de 9 a 18", summary: "Cambio el subtítulo: atención de lunes a viernes de 9 a 18",
    ops: [{ type: "set_text", path: "/hero/subtitle", value: "Atención de lunes a viernes de 9 a 18" }],
    changes: [{ pointer: "/hero/subtitle", before: "Atención de lunes a viernes de 10 a 17", after: "Atención de lunes a viernes de 9 a 18" }],
    reasons: ["Textos: automático"], cost: 0.0114,
  },
  {
    short: "EJPEB3", key: "pereira", hoursAgo: 120, thisMonth: true, status: "publicado", category: "permitido",
    text: "agregá que también hacemos sucesiones", summary: "Agrego sucesiones al texto de quiénes somos",
    ops: [{ type: "set_text", path: "/about/text", value: "Derecho de familia, laboral y sucesiones. Más de 25 años en Montevideo." }],
    changes: [{ pointer: "/about/text", before: "Derecho de familia y laboral. Más de 25 años en Montevideo.", after: "Derecho de familia, laboral y sucesiones. Más de 25 años en Montevideo." }],
    reasons: ["Textos: automático"], cost: 0.0151,
  },
  {
    short: "EJPEC4", key: "pereira", hoursAgo: 100, thisMonth: true, status: "cotizado", category: "fuera_de_alcance",
    text: "quiero que los clientes puedan agendar una consulta desde la web", summary: "Quiere una agenda de consultas online",
    ops: [], changes: [], reasons: [], cost: 0.0264,
    quote: {
      title: "Agenda de consultas online",
      description: "Calendario con los horarios libres del estudio, reserva con nombre y teléfono, y recordatorio por mail el día anterior.",
      amount: 380, eta: 6, status: "enviado",
    },
  },
  {
    short: "EJPED5", key: "pereira", hoursAgo: 75, thisMonth: true, status: "derivado", category: "derivado",
    text: "subí el PDF del arancel nuevo del colegio", summary: "Quiere subir un PDF con el arancel",
    ops: [], changes: [], reasons: ["No pude traducir el pedido a cambios concretos"], cost: 0.0093,
    error: "No pude traducir el pedido a cambios concretos",
  },
  {
    short: "EJPEE6", key: "pereira", hoursAgo: 70, thisMonth: true, status: "publicado", category: "permitido",
    text: "poné en honorarios que seguimos el arancel del Colegio de Abogados", summary: "Agrego al texto de honorarios que siguen el arancel del Colegio",
    ops: [{ type: "set_text", path: "/about/text", value: "Derecho de familia, laboral y sucesiones. Honorarios según el arancel del Colegio de Abogados." }],
    changes: [{ pointer: "/about/text", before: "Derecho de familia, laboral y sucesiones. Más de 25 años en Montevideo.", after: "Derecho de familia, laboral y sucesiones. Honorarios según el arancel del Colegio de Abogados." }],
    reasons: ["Textos: automático"], cost: 0.0138,
  },
  {
    short: "EJPEF7", key: "pereira", hoursAgo: 30, thisMonth: true, status: "publicado", category: "permitido",
    text: "el viernes cerramos a las 15", summary: "El viernes cierro a las 15:00",
    ops: [{ type: "set_hours", day: "vie", open: "09:00", close: "15:00" }],
    changes: [{ pointer: "/hours/4/close", before: "18:00", after: "15:00" }],
    reasons: ["Horarios: automático"], cost: 0.0112,
  },
  {
    short: "EJPEG8", key: "pereira", hoursAgo: 3, thisMonth: true, status: "esperando_cliente", category: "permitido",
    text: "cambiá el título por Abogados en Montevideo desde 1998", summary: "Cambio el título principal por “Abogados en Montevideo desde 1998”",
    ops: [{ type: "set_text", path: "/hero/title", value: "Abogados en Montevideo desde 1998" }],
    changes: [{ pointer: "/hero/title", before: "Estudio Jurídico Pereira", after: "Abogados en Montevideo desde 1998" }],
    reasons: ["Textos: automático"], cost: 0.0129,
  },
  {
    short: "EJPEH9", key: "pereira", hoursAgo: 24 * 45, thisMonth: false, status: "publicado", category: "permitido",
    text: "actualizá el mail de contacto a consultas@pereira.uy", summary: "Cambio el mail de contacto",
    ops: [{ type: "set_text", path: "/hero/cta", value: "Escribinos a consultas@pereira.uy" }],
    changes: [{ pointer: "/hero/cta", before: "Escribinos a estudio@pereira.uy", after: "Escribinos a consultas@pereira.uy" }],
    reasons: ["Textos: automático"], cost: 0.0102,
  },
];

const STEPS: Record<Status, [string, number][]> = {
  publicado: [["recibido", 130], ["interpretado", 2300], ["decidido", 10], ["gate", 9], ["borrador", 160], ["captura", 3200], ["enviado", 560], ["aprobado_cliente", 7400], ["publicando", 80], ["publicado", 240], ["commit", 1300]],
  esperando_agencia: [["recibido", 120], ["interpretado", 2700], ["decidido", 11], ["gate", 10], ["borrador", 170], ["captura", 3500], ["enviado", 540]],
  esperando_cliente: [["recibido", 110], ["interpretado", 2200], ["decidido", 9], ["gate", 8], ["borrador", 150], ["captura", 3100], ["enviado", 520]],
  cotizado: [["recibido", 120], ["interpretado", 2400], ["decidido", 6], ["presupuesto", 4700], ["enviado", 500]],
  derivado: [["recibido", 120], ["interpretado", 2500], ["decidido", 8], ["derivado", 300]],
};

function replies(s: ReqSpec, agency: string): string[] {
  const first = "Recibido, ya lo veo.";
  switch (s.status) {
    case "publicado":
      return [first, `¿Así? ${s.summary}`, "Listo, ya está publicado."];
    case "esperando_cliente":
      return [first, `¿Así? ${s.summary}`];
    case "esperando_agencia":
      return [first, `Esto lo aprueba ${agency} porque los carteles de promoción los revisa la agencia. Te aviso apenas esté.`];
    case "cotizado":
      return [first, `Eso es algo nuevo para tu web. Se lo paso a ${agency} para que te mande un presupuesto.`];
    case "derivado":
      return [first, "No pude hacerlo solo, se lo pasé a tu equipo. Te escriben en breve."];
  }
}

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

/** Comienzo del mes corriente en Montevideo (UTC-3 fijo). */
export function monthStartMontevideo(now: number): number {
  const local = new Date(now - 3 * 3_600_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3);
}

export type SampleClientRows = {
  clients: {
    id: string; factory_id: string; name: string; contact_name: string; plan_name: string;
    monthly_quota: number; monthly_fee_usd: number; notes: string; is_sample: boolean; created_at: string;
  }[];
  projects: {
    id: string; factory_id: string; client_id: string; name: string; client_name: string; repo_owner: string; repo_name: string;
    default_branch: string; mode: "contenido"; config_path: string; site_url: string | null; is_sample: true; created_at: string;
  }[];
  contacts: { id: string; project_id: string; display_name: string; role: "cliente"; telegram_chat_id: number; created_at: string }[];
  requests: {
    id: string; short_id: string; project_id: string; contact_id: string; raw_text: string; status: Status; category: Category;
    lane: "contenido" | null; confidence: number; interpretation: Record<string, unknown>; ops: Record<string, unknown>[] | null;
    changes: { pointer: string; before: unknown; after: unknown }[] | null; gate: { outcome: string; reasons: string[] } | null;
    rules_version: number; draft_version_id: null; live_version_id: null; parent_request_id: null; pr_url: null; pr_number: null;
    preview_url: null; quote_id: string | null; error: string | null; cost_usd: number; usage: Record<string, number>;
    is_sample: true; created_at: string; updated_at: string;
  }[];
  quotes: { id: string; request_id: string; title: string; description: string; amount_usd: number; eta_days: number; status: "borrador" | "enviado"; created_at: string }[];
  events: { request_id: string; step: string; status: "inicio" | "ok"; detail: null; duration_ms: number | null; at: string }[];
  messages: { id: string; request_id: string; contact_id: string; direction: "entrada" | "salida"; text: string; media: null; at: string }[];
  approvals: { id: string; request_id: string; actor: "cliente"; decision: "aprobado"; via: "telegram"; at: string }[];
};

/** Clientes de ejemplo con sus proyectos y pedidos, con fechas relativas a `now`. */
export function buildSampleClientRows(opts: { now: number; factoryId: string; agencyName: string }): SampleClientRows {
  const { now, factoryId, agencyName } = opts;
  const iso = (t: number) => new Date(t).toISOString();
  const monthStart = monthStartMontevideo(now);
  const projectOf = { ferreteria: SAMPLE_IDS.projectFerreteria, pereira: SAMPLE_IDS.projectPereira } as const;
  const contactOf = { ferreteria: SAMPLE_IDS.contactFerreteria, pereira: SAMPLE_IDS.contactPereira } as const;

  const rows: SampleClientRows = {
    clients: [
      {
        id: SAMPLE_IDS.clientFerreteria, factory_id: factoryId, name: "Ferretería Don Raúl", contact_name: "Raúl", plan_name: "Mantenimiento",
        monthly_quota: 15, monthly_fee_usd: 45, notes: "Cliente de ejemplo. Prefiere que lo llamen antes de las 10.", is_sample: true, created_at: iso(now - 86_400_000 * 120),
      },
      {
        id: SAMPLE_IDS.clientPereira, factory_id: factoryId, name: "Estudio Jurídico Pereira", contact_name: "Dra. Pereira", plan_name: "Básico",
        monthly_quota: 5, monthly_fee_usd: 25, notes: "Cliente de ejemplo.", is_sample: true, created_at: iso(now - 86_400_000 * 90),
      },
    ],
    projects: [
      {
        id: SAMPLE_IDS.projectFerreteria, factory_id: factoryId, client_id: SAMPLE_IDS.clientFerreteria, name: "Ferretería Don Raúl", client_name: "Raúl",
        repo_owner: "ejemplo", repo_name: "ferreteria-don-raul", default_branch: "main", mode: "contenido", config_path: "walt.config.json",
        site_url: null, is_sample: true, created_at: iso(now - 86_400_000 * 120),
      },
      {
        id: SAMPLE_IDS.projectPereira, factory_id: factoryId, client_id: SAMPLE_IDS.clientPereira, name: "Estudio Jurídico Pereira", client_name: "Dra. Pereira",
        repo_owner: "ejemplo", repo_name: "estudio-pereira", default_branch: "main", mode: "contenido", config_path: "walt.config.json",
        site_url: null, is_sample: true, created_at: iso(now - 86_400_000 * 90),
      },
    ],
    contacts: [
      { id: SAMPLE_IDS.contactFerreteria, project_id: SAMPLE_IDS.projectFerreteria, display_name: "Raúl", role: "cliente", telegram_chat_id: -1001, created_at: iso(now - 86_400_000 * 120) },
      { id: SAMPLE_IDS.contactPereira, project_id: SAMPLE_IDS.projectPereira, display_name: "Dra. Pereira", role: "cliente", telegram_chat_id: -1002, created_at: iso(now - 86_400_000 * 90) },
    ],
    requests: [],
    quotes: [],
    events: [],
    messages: [],
    approvals: [],
  };

  SPECS.forEach((s, i) => {
    const id = uuid("66666666", i + 1);
    let created = now - s.hoursAgo * 3_600_000;
    // Los del mes corriente nunca caen en el mes anterior (por ejemplo, el día 2 del mes).
    if (s.thisMonth && created < monthStart) created = Math.min(now - 60_000 * (SPECS.length - i), monthStart + 60_000 * (i + 1));
    const steps = STEPS[s.status];
    let t = created;
    for (const [step, dur] of steps) {
      rows.events.push({ request_id: id, step, status: "inicio", detail: null, duration_ms: null, at: iso(t) });
      t += dur;
      rows.events.push({ request_id: id, step, status: "ok", detail: null, duration_ms: dur, at: iso(t) });
    }
    const contact = contactOf[s.key];
    rows.messages.push({ id: uuid("77777777", i * 10), request_id: id, contact_id: contact, direction: "entrada", text: s.text, media: null, at: iso(created) });
    replies(s, agencyName).forEach((text, k, all) =>
      rows.messages.push({
        id: uuid("77777777", i * 10 + k + 1), request_id: id, contact_id: contact, direction: "salida", text, media: null,
        at: iso(created + 400 + Math.round(((t - created) * (k + 1)) / all.length)),
      }),
    );
    if (s.status === "publicado")
      rows.approvals.push({ id: uuid("88888888", i + 1), request_id: id, actor: "cliente", decision: "aprobado", via: "telegram", at: iso(t - 2000) });
    let quoteId: string | null = null;
    if (s.quote) {
      quoteId = uuid("99999999", i + 1);
      rows.quotes.push({
        id: quoteId, request_id: id, title: s.quote.title, description: s.quote.description, amount_usd: s.quote.amount,
        eta_days: s.quote.eta, status: s.quote.status, created_at: iso(t),
      });
    }
    const hasOps = s.ops.length > 0;
    rows.requests.push({
      id,
      short_id: s.short,
      project_id: projectOf[s.key],
      contact_id: contact,
      raw_text: s.text,
      status: s.status,
      category: s.category,
      lane: hasOps ? "contenido" : null,
      confidence: s.category === "derivado" ? 0.42 : 0.94,
      interpretation: {
        kind: s.category === "fuera_de_alcance" ? "funcion_nueva" : "cambio",
        summary: s.summary,
        confidence: s.category === "derivado" ? 0.42 : 0.94,
        ops: s.ops,
        needsCode: false,
        unexpressedParts: s.category === "derivado" ? ["subir un PDF"] : [],
      },
      ops: hasOps ? s.ops : null,
      changes: hasOps ? s.changes : null,
      gate: hasOps ? { outcome: s.status === "esperando_agencia" ? "agencia" : "auto", reasons: s.reasons } : null,
      rules_version: 1,
      draft_version_id: null,
      live_version_id: null,
      parent_request_id: null,
      pr_url: null,
      pr_number: null,
      preview_url: null,
      quote_id: quoteId,
      error: s.error ?? null,
      cost_usd: s.cost,
      usage: { input_tokens: 2300 + i * 41, output_tokens: 280 + i * 13 },
      is_sample: true,
      created_at: iso(created),
      updated_at: iso(t),
    });
  });
  return rows;
}

/** Cliente real de la panadería del seed (no es de ejemplo). */
export const MABEL_CLIENT = {
  id: SAMPLE_IDS.clientMabel,
  name: "Panadería Mabel",
  contact_name: "Mabel",
  plan_name: "Mantenimiento",
  monthly_quota: 20,
  monthly_fee_usd: 60,
  notes: "",
  is_sample: false,
} as const;
