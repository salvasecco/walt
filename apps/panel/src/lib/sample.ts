// Datos de ejemplo: SOLO en desarrollo y sin Supabase. Se muestran con la etiqueta "datos de ejemplo".
// Reproducen los casos de la demo (SPEC §1) sobre la Panadería Mabel (SPEC §14).
import { buildSampleClientRows, MABEL_CLIENT } from "./sample-clients.mts";
import type {
  Approval,
  Category,
  Client,
  Contact,
  Change,
  ContentVersion,
  DaleEvent,
  DaleRequest,
  Interpretation,
  Message,
  Op,
  Project,
  Quote,
  RequestStatus,
  Rules,
  SiteContent,
} from "./types";
import { SEED_FACTORY_ID, SEED_PROJECT_ID } from "./types";

export const BAKERY: SiteContent = {
  brand: { name: "Panadería Mabel", tagline: "Pan de masa madre, todos los días" },
  theme: { primary: "#B45309", accent: "#F59E0B", background: "#FFF7ED", text: "#1C1917" },
  hero: {
    title: "El pan de siempre, recién salido",
    subtitle: "Horneamos todos los días desde las 6 de la mañana",
    cta: "Pedí por WhatsApp",
  },
  banner: { enabled: false, text: "", discountPercent: null, startsAt: null, endsAt: null },
  products: [
    { id: "pan-flauta", name: "Pan flauta", category: "panes", price: 80, available: true },
    { id: "pan-masa-madre", name: "Pan de masa madre", category: "panes", price: 220, available: true },
    { id: "baguette", name: "Baguette", category: "panes", price: 90, available: true },
    { id: "medialunas", name: "Medialunas, la docena", category: "facturas", price: 260, available: true },
    { id: "bizcochos", name: "Bizcochos surtidos, la docena", category: "facturas", price: 240, available: true },
    { id: "croissant", name: "Croissant de manteca", category: "facturas", price: 75, available: true },
    { id: "chaja", name: "Torta chajá, la porción", category: "tortas", price: 180, available: true },
    { id: "alfajor-maicena", name: "Alfajor de maicena", category: "dulces", price: 45, available: true },
    { id: "cafe", name: "Café", category: "bebidas", price: 90, available: true },
  ],
  hours: [
    { day: "lun", open: "07:00", close: "20:00" },
    { day: "mar", open: "07:00", close: "20:00" },
    { day: "mie", open: "07:00", close: "20:00" },
    { day: "jue", open: "07:00", close: "20:00" },
    { day: "vie", open: "07:00", close: "20:00" },
    { day: "sab", open: "07:00", close: "20:00" },
    { day: "dom", open: "08:00", close: "13:00" },
  ],
  about: {
    title: "Quiénes somos",
    text: "Una panadería de barrio en Montevideo. Masa madre, manteca de verdad y mucho tiempo de horno.",
  },
  sections: { about: true, hours: true, contact: true },
};

export const DEFAULT_RULES: Pick<Rules, "policies" | "limits"> = {
  policies: {
    set_text: "auto",
    set_price: "auto",
    adjust_prices: "auto",
    set_availability: "auto",
    set_color: "auto",
    set_hours: "auto",
    set_banner: "agencia",
    toggle_section: "agencia",
  },
  limits: { maxPriceChangePct: 30, monthlyQuota: 200, minConfidence: 0.6, maxOpsPerRequest: 40 },
};

type Spec = {
  short: string;
  minutesAgo: number;
  text: string;
  category: Category;
  status: RequestStatus;
  lane?: "contenido" | "codigo";
  summary: string;
  kind?: Interpretation["kind"];
  ops?: Op[];
  changes?: Change[];
  reasons?: string[];
  outcome?: "auto" | "agencia" | "bloqueado";
  steps: [string, number, ("ok" | "falla" | "inicio")?][];
  replies: string[];
  cost: number;
  confidence?: number;
  pr?: { url: string; number: number; preview: string };
};

const SPECS: Spec[] = [
  {
    short: "A7K2",
    minutesAgo: 2,
    text: "subí el pan flauta a 95",
    category: "permitido",
    status: "publicado",
    summary: "Subo el pan flauta de $80 a $95",
    ops: [{ type: "set_price", productId: "pan-flauta", value: 95 }],
    changes: [{ pointer: "/products/0/price", before: 80, after: 95 }],
    outcome: "auto",
    reasons: ["Cambio de precio dentro del límite (19% < 30%)"],
    steps: [
      ["recibido", 140],
      ["interpretado", 2310],
      ["decidido", 12],
      ["gate", 9],
      ["borrador", 180],
      ["captura", 3420],
      ["enviado", 610],
      ["aprobado_cliente", 8400],
      ["publicando", 90],
      ["publicado", 240],
      ["commit", 1310],
    ],
    replies: ["Recibido, ya lo veo.", "Entendí: Subo el pan flauta de $80 a $95. Armo la vista previa…", "¿Así? Subo el pan flauta de $80 a $95", "Listo, ya está publicado."],
    cost: 0.0142,
    confidence: 0.97,
  },
  {
    short: "B3M9",
    minutesAgo: 14,
    text: "poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo",
    category: "riesgoso",
    status: "esperando_agencia",
    summary: "Pongo un cartel de Black Friday con 25% de descuento en todo hasta el domingo",
    ops: [
      { type: "set_banner", enabled: true, text: "Black Friday: 25% en todo", discountPercent: 25, startsAt: null, endsAt: "2026-10-18T23:59:00-03:00" },
    ],
    changes: [
      { pointer: "/banner/enabled", before: false, after: true },
      { pointer: "/banner/text", before: "", after: "Black Friday: 25% en todo" },
      { pointer: "/banner/discountPercent", before: null, after: 25 },
      { pointer: "/banner/endsAt", before: null, after: "2026-10-18T23:59:00-03:00" },
    ],
    outcome: "agencia",
    reasons: ["Los carteles de promoción los aprueba la agencia (regla set_banner)"],
    steps: [
      ["recibido", 120],
      ["interpretado", 2870],
      ["decidido", 10],
      ["gate", 11],
      ["borrador", 160],
      ["captura", 3610],
      ["enviado", 540],
    ],
    replies: ["Recibido, ya lo veo.", "Esto lo aprueba Estudio Faro porque los carteles de promoción los revisa la agencia. Te aviso apenas esté."],
    cost: 0.0188,
    confidence: 0.93,
  },
  {
    short: "C9P4",
    minutesAgo: 31,
    text: "subí 10% todos los precios",
    category: "permitido",
    status: "publicado",
    summary: "Subo 10% todos los precios, redondeando a múltiplos de 5",
    ops: [{ type: "adjust_prices", filter: { all: true }, percent: 10, rounding: "nearest_5" }],
    changes: [
      { pointer: "/products/1/price", before: 220, after: 240 },
      { pointer: "/products/2/price", before: 90, after: 100 },
      { pointer: "/products/3/price", before: 260, after: 285 },
      { pointer: "/products/6/price", before: 180, after: 200 },
    ],
    outcome: "auto",
    reasons: ["Ajuste del 10%, dentro del límite de 30%"],
    steps: [
      ["recibido", 130],
      ["interpretado", 2650],
      ["decidido", 14],
      ["gate", 15],
      ["borrador", 170],
      ["captura", 3300],
      ["enviado", 580],
      ["aprobado_cliente", 12100],
      ["publicando", 80],
      ["publicado", 260],
      ["commit", 1420],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? Subo 10% todos los precios, redondeando a múltiplos de 5", "Listo, ya está publicado."],
    cost: 0.0211,
    confidence: 0.95,
  },
  {
    short: "D2X8",
    minutesAgo: 44,
    text: "cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>",
    category: "bloqueado",
    status: "bloqueado",
    summary: "El pedido trae código HTML: no se aplica nada",
    outcome: "bloqueado",
    reasons: ["El texto trae HTML o código (<script). Se bloquea antes de interpretar"],
    steps: [
      ["recibido", 110],
      ["decidido", 3],
      ["enviado", 520],
    ],
    replies: ["Recibido, ya lo veo.", "Eso no lo puedo hacer desde acá. Se lo paso a Estudio Faro."],
    cost: 0,
    confidence: 1,
  },
  {
    short: "E5Q1",
    minutesAgo: 58,
    text: "¿a qué hora abren el domingo?",
    category: "consulta",
    status: "respondido",
    kind: "consulta",
    summary: "Pregunta el horario del domingo",
    steps: [
      ["recibido", 100],
      ["interpretado", 1980],
      ["decidido", 5],
      ["respondido", 1640],
    ],
    replies: ["Recibido, ya lo veo.", "El domingo abrimos de 8:00 a 13:00."],
    cost: 0.0094,
    confidence: 0.98,
  },
  {
    short: "F8T6",
    minutesAgo: 75,
    text: "quiero que la gente pueda reservar tortas online",
    category: "fuera_de_alcance",
    status: "cotizado",
    kind: "funcion_nueva",
    summary: "Quiere un sistema de reservas de tortas online",
    steps: [
      ["recibido", 120],
      ["interpretado", 2420],
      ["decidido", 6],
      ["presupuesto", 4810],
      ["enviado", 500],
    ],
    replies: ["Recibido, ya lo veo.", "Eso es algo nuevo para tu web. Se lo paso a Estudio Faro para que te mande un presupuesto."],
    cost: 0.0312,
    confidence: 0.91,
  },
  {
    short: "G1N3",
    minutesAgo: 96,
    text: "no tenemos más medialunas hoy",
    category: "permitido",
    status: "publicado",
    summary: "Marco las medialunas como sin stock",
    ops: [{ type: "set_availability", productId: "medialunas", available: false }],
    changes: [{ pointer: "/products/3/available", before: true, after: false }],
    outcome: "auto",
    reasons: ["Disponibilidad: automático"],
    steps: [
      ["recibido", 120],
      ["interpretado", 2100],
      ["decidido", 9],
      ["gate", 8],
      ["borrador", 150],
      ["captura", 3150],
      ["enviado", 560],
      ["aprobado_cliente", 6900],
      ["publicando", 70],
      ["publicado", 230],
      ["commit", 1270],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? Marco las medialunas como sin stock", "Listo, ya está publicado."],
    cost: 0.0127,
    confidence: 0.96,
  },
  {
    short: "H4V7",
    minutesAgo: 130,
    text: "poné el fondo violeta",
    category: "permitido",
    status: "revertido",
    summary: "Cambio el color de fondo a violeta (#EDE9FE)",
    ops: [{ type: "set_color", token: "background", value: "#EDE9FE" }],
    changes: [{ pointer: "/theme/background", before: "#FFF7ED", after: "#EDE9FE" }],
    outcome: "auto",
    reasons: ["Colores: automático"],
    steps: [
      ["recibido", 130],
      ["interpretado", 2200],
      ["decidido", 8],
      ["gate", 10],
      ["borrador", 160],
      ["captura", 3200],
      ["enviado", 590],
      ["aprobado_cliente", 5200],
      ["publicando", 80],
      ["publicado", 250],
      ["commit", 1350],
      ["revertido", 1410],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? Cambio el color de fondo a violeta", "Listo, ya está publicado.", "Listo, volvió a como estaba."],
    cost: 0.0133,
    confidence: 0.9,
  },
  {
    short: "J6R2",
    minutesAgo: 160,
    text: "agregá un mapa de google abajo de la dirección",
    category: "riesgoso",
    status: "agente_listo",
    lane: "codigo",
    summary: "Agrega un mapa de Google debajo de la dirección",
    reasons: ["Necesita código: no entra en las operaciones de contenido"],
    outcome: "agencia",
    steps: [
      ["recibido", 120],
      ["interpretado", 2600],
      ["decidido", 7],
      ["aprobado_agencia", 41000],
      ["agente_inicio", 98000],
      ["agente_pr", 2400],
      ["agente_preview", 61000],
    ],
    replies: ["Recibido, ya lo veo.", "Esto lo aprueba Estudio Faro porque necesita un cambio de código. Te aviso apenas esté."],
    cost: 0.4120,
    confidence: 0.88,
    pr: {
      url: "https://github.com/salvasecco/dale-demo/pull/12",
      number: 12,
      preview: "https://dale-demo-git-dale-j6r2-salvasecco.vercel.app",
    },
  },
  {
    short: "K3L5",
    minutesAgo: 190,
    text: "el sábado abrimos hasta las 14",
    category: "permitido",
    status: "publicado",
    summary: "El sábado cierro a las 14:00",
    ops: [{ type: "set_hours", day: "sab", open: "07:00", close: "14:00" }],
    changes: [{ pointer: "/hours/5/close", before: "20:00", after: "14:00" }],
    outcome: "auto",
    reasons: ["Horarios: automático"],
    steps: [
      ["recibido", 110],
      ["interpretado", 2050],
      ["decidido", 9],
      ["gate", 7],
      ["borrador", 140],
      ["captura", 3050],
      ["enviado", 530],
      ["aprobado_cliente", 4300],
      ["publicando", 70],
      ["publicado", 220],
      ["commit", 0, "falla"],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? El sábado cierro a las 14:00", "Listo, ya está publicado."],
    cost: 0.0119,
    confidence: 0.94,
  },
  {
    short: "L8C1",
    minutesAgo: 260,
    text: "subí el café a 95",
    category: "permitido",
    status: "publicado",
    summary: "Subo el café de $90 a $95",
    ops: [{ type: "set_price", productId: "cafe", value: 95 }],
    changes: [{ pointer: "/products/8/price", before: 90, after: 95 }],
    outcome: "auto",
    reasons: ["Cambio de precio dentro del límite"],
    steps: [
      ["recibido", 120],
      ["interpretado", 2000],
      ["decidido", 8],
      ["gate", 9],
      ["borrador", 150],
      ["captura", 3100],
      ["enviado", 570],
      ["aprobado_cliente", 7100],
      ["publicando", 80],
      ["publicado", 230],
      ["commit", 1280],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? Subo el café de $90 a $95", "Listo, ya está publicado."],
    cost: 0.0121,
    confidence: 0.97,
  },
  {
    short: "M2W9",
    minutesAgo: 300,
    text: "bajá la baguette a 85",
    category: "permitido",
    status: "publicado",
    summary: "Bajo la baguette de $90 a $85",
    ops: [{ type: "set_price", productId: "baguette", value: 85 }],
    changes: [{ pointer: "/products/2/price", before: 90, after: 85 }],
    outcome: "auto",
    reasons: ["Cambio de precio dentro del límite"],
    steps: [
      ["recibido", 120],
      ["interpretado", 1900],
      ["decidido", 8],
      ["gate", 9],
      ["borrador", 150],
      ["captura", 3000],
      ["enviado", 560],
      ["aprobado_cliente", 5400],
      ["publicando", 80],
      ["publicado", 220],
      ["commit", 1250],
    ],
    replies: ["Recibido, ya lo veo.", "¿Así? Bajo la baguette de $90 a $85", "Listo, ya está publicado."],
    cost: 0.0118,
    confidence: 0.97,
  },
];

const uuid = (n: number, prefix = "aaaaaaaa") =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export type SampleData = {
  clients: Client[];
  contacts: Contact[];
  projects: Project[];
  rules: Rules[];
  requests: DaleRequest[];
  events: DaleEvent[];
  messages: Message[];
  versions: ContentVersion[];
  approvals: Approval[];
  quotes: Quote[];
};

export function buildSample(now = Date.now()): SampleData {
  const project: Project = {
    id: SEED_PROJECT_ID,
    factory_id: SEED_FACTORY_ID,
    name: "Panadería Mabel",
    client_name: "Mabel",
    repo_owner: "salvasecco",
    repo_name: "dale-demo",
    default_branch: "main",
    mode: "contenido",
    config_path: "dale.config.json",
    site_url: null,
    created_at: new Date(now - 86_400_000 * 3).toISOString(),
  };
  project.client_id = MABEL_CLIENT.id;
  project.is_sample = false;
  const rules: Rules[] = [1, 2, 3].map((v) => ({
    id: uuid(v, "cccccccc"),
    project_id: SEED_PROJECT_ID,
    version: v,
    ...structuredClone(DEFAULT_RULES),
    created_by: v === 1 ? "seed" : "panel",
    created_at: new Date(now - 86_400_000 * (3 - v) - 3_600_000).toISOString(),
  }));

  const requests: DaleRequest[] = [];
  const events: DaleEvent[] = [];
  const messages: Message[] = [];
  const versions: ContentVersion[] = [];
  const approvals: Approval[] = [];
  const quotes: Quote[] = [];
  let evId = 1;
  let msgN = 1;

  SPECS.forEach((s, i) => {
    const id = uuid(i + 1);
    const created = now - s.minutesAgo * 60_000;
    let t = created;
    for (const [step, dur, st] of s.steps) {
      const status = st ?? "ok";
      events.push({ id: evId++, request_id: id, step, status: "inicio", detail: null, duration_ms: null, at: new Date(t).toISOString() });
      t += dur;
      if (status !== "inicio")
        events.push({
          id: evId++,
          request_id: id,
          step,
          status,
          detail: status === "falla" ? { error: "GitHub no respondió en 20 s" } : null,
          duration_ms: dur,
          at: new Date(t).toISOString(),
        });
    }
    messages.push({ id: uuid(msgN++, "dddddddd"), request_id: id, contact_id: null, direction: "entrada", text: s.text, media: null, at: new Date(created).toISOString() });
    s.replies.forEach((r, k) =>
      messages.push({
        id: uuid(msgN++, "dddddddd"),
        request_id: id,
        contact_id: null,
        direction: "salida",
        text: r,
        media: null,
        at: new Date(created + 400 + k * Math.max(1500, (t - created) / s.replies.length)).toISOString(),
      }),
    );
    let draftId: string | null = null;
    if (s.changes) {
      draftId = uuid(i + 1, "eeeeeeee");
      const published = ["publicado", "revertido"].includes(s.status);
      versions.push({
        id: draftId,
        project_id: SEED_PROJECT_ID,
        request_id: id,
        parent_id: null,
        status: published ? "reemplazada" : "borrador",
        content: BAKERY,
        git_commit_sha: published && s.short !== "K3L5" ? `${(i * 7919 + 0xa1b2c3).toString(16)}e4f0d9` : null,
        git_error: s.short === "K3L5" ? "GitHub no respondió en 20 s" : null,
        published_at: published ? new Date(t).toISOString() : null,
        created_at: new Date(created + 3000).toISOString(),
      });
      if (published) approvals.push({ id: uuid(i + 1, "ffffffff"), request_id: id, actor: "cliente", decision: "aprobado", via: "telegram", at: new Date(t - 2000).toISOString() });
    }
    if (s.lane === "codigo")
      approvals.push({ id: uuid(i + 101, "ffffffff"), request_id: id, actor: "agencia", decision: "aprobado", via: "panel", at: new Date(created + 45_000).toISOString() });
    let quoteId: string | null = null;
    if (s.category === "fuera_de_alcance") {
      quoteId = uuid(i + 1, "abababab");
      quotes.push({
        id: quoteId,
        request_id: id,
        title: "Reservas de tortas online",
        description:
          "Formulario de reserva con fecha de retiro, sabor y tamaño. Aviso por WhatsApp a la panadería y confirmación al cliente. Incluye panel simple para ver las reservas del día.",
        amount_usd: 450,
        eta_days: 7,
        status: "borrador",
        created_at: new Date(t).toISOString(),
      });
    }
    const interp: Interpretation = {
      kind: s.kind ?? "cambio",
      summary: s.summary,
      confidence: s.confidence ?? 0.9,
      ops: s.ops ?? [],
      needsCode: s.lane === "codigo",
      codeInstruction: s.lane === "codigo" ? "Agregar un iframe de Google Maps con la dirección del contacto, debajo de la dirección, responsive." : undefined,
      unexpressedParts: s.lane === "codigo" ? ["mapa de Google"] : [],
    };
    requests.push({
      id,
      short_id: s.short,
      project_id: SEED_PROJECT_ID,
      contact_id: null,
      raw_text: s.text,
      status: s.status,
      category: s.category,
      lane: s.lane ?? (s.changes ? "contenido" : null),
      confidence: s.confidence ?? null,
      interpretation: s.category === "bloqueado" ? null : interp,
      ops: s.ops ?? null,
      changes: s.changes ?? null,
      gate: s.outcome ? { outcome: s.outcome, reasons: s.reasons ?? [] } : null,
      rules_version: 3,
      draft_version_id: draftId,
      live_version_id: null,
      parent_request_id: null,
      pr_url: s.pr?.url ?? null,
      pr_number: s.pr?.number ?? null,
      preview_url: s.pr?.preview ?? null,
      quote_id: quoteId,
      error: null,
      cost_usd: s.cost,
      usage: { input_tokens: 2400 + i * 37, output_tokens: 310 + i * 11 },
      created_at: new Date(created).toISOString(),
      updated_at: new Date(t).toISOString(),
    });
  });

  // Algunos pedidos viejos para "Lo que piden".
  const older = [
    ["subí las medialunas a 270", "set_price"],
    ["el pan de masa madre a 230", "set_price"],
    ["subí 5% las facturas", "adjust_prices"],
    ["el croissant a 80", "set_price"],
    ["no hay chajá hoy", "set_availability"],
    ["cambiá el subtítulo", "set_text"],
  ] as const;
  older.forEach(([text, type], k) => {
    const id = uuid(500 + k);
    const created = now - 86_400_000 * (k + 2);
    requests.push({
      ...requests[0],
      id,
      short_id: `Z${k}Q${k + 3}`,
      raw_text: text,
      status: "publicado",
      category: "permitido",
      interpretation: { ...requests[0].interpretation!, summary: text, ops: [] },
      ops: [{ type, productId: "medialunas", value: 1 } as unknown as Op],
      changes: [],
      draft_version_id: null,
      cost_usd: 0.012,
      created_at: new Date(created).toISOString(),
      updated_at: new Date(created + 20_000).toISOString(),
    });
  });

  versions.push({
    id: uuid(999, "eeeeeeee"),
    project_id: SEED_PROJECT_ID,
    request_id: requests[0].id,
    parent_id: null,
    status: "viva",
    content: {
      ...BAKERY,
      products: BAKERY.products!.map((p) => (p.id === "pan-flauta" ? { ...p, price: 95 } : p)),
    },
    git_commit_sha: "a1b2c3d4e5f6",
    git_error: null,
    published_at: new Date(now - 60_000).toISOString(),
    created_at: new Date(now - 70_000).toISOString(),
  });
  requests[0].live_version_id = uuid(999, "eeeeeeee");

  // Clientes de ejemplo: los mismos que inserta `pnpm seed` con is_sample = true.
  const extra = buildSampleClientRows({ now, factoryId: SEED_FACTORY_ID, agencyName: "Estudio Faro" });
  const clients: Client[] = [{ ...MABEL_CLIENT, factory_id: SEED_FACTORY_ID, created_at: project.created_at }, ...extra.clients];
  for (const r of extra.requests) requests.push(r as unknown as DaleRequest);
  for (const e of extra.events) events.push({ ...e, id: evId++ });
  messages.push(...extra.messages);
  approvals.push(...extra.approvals);
  quotes.push(...extra.quotes);
  const contacts: Contact[] = extra.contacts.map((c) => ({ id: c.id, project_id: c.project_id, display_name: c.display_name, role: c.role, created_at: c.created_at }));
  requests.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { clients, contacts, projects: [project, ...extra.projects], rules, requests, events, messages, versions, approvals, quotes };
}

/** Guion para animar el recorrido en En vivo con datos de ejemplo. */
export const SIMULATION_SPEC = SPECS[0];
