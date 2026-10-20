import { EMPTY_USAGE, type Interpretation, type Inventory, type InventoryProduct, type Op } from '@walt/core';
import type { AiProvider, InterpretInput } from './types.js';

/**
 * Regex interpreter that covers the demo cases of SPEC §1. ONLY for tests and parallel
 * development: the demo always runs with the real model.
 */

const COLORS: Record<string, string> = {
  violeta: '#7C3AED',
  morado: '#7C3AED',
  lila: '#A78BFA',
  rojo: '#DC2626',
  azul: '#2563EB',
  celeste: '#38BDF8',
  verde: '#16A34A',
  amarillo: '#FACC15',
  naranja: '#EA580C',
  rosa: '#EC4899',
  negro: '#111111',
  blanco: '#FFFFFF',
  gris: '#6B7280',
  marron: '#92400E',
  'marrón': '#92400E',
  beige: '#F5F5DC',
};

/** Deep tones for buttons, so the white button text stays readable. */
const BUTTON_TONES: Record<string, string> = {
  verde: '#15803D',
  naranja: '#C2410C',
  azul: '#2563EB',
  rojo: '#B91C1C',
  violeta: '#6D28D9',
  morado: '#6D28D9',
  rosa: '#BE185D',
  gris: '#4B5563',
};
const LIGHT = new Set(['amarillo', 'celeste', 'blanco', 'beige', 'lila']);
const COLOR_LABELS: Record<string, string> = {
  background: 'el fondo',
  accent: 'el color de acento',
  primary: 'el color principal',
  title: 'el título',
  button: 'los botones',
  buttonText: 'el texto de los botones',
  text: 'el texto',
};

/** Light tints for backgrounds, so the dark text stays readable (same rule as the interpret prompt). */
const BACKGROUND_TINTS: Record<string, string> = {
  violeta: '#EDE9FE',
  morado: '#EDE9FE',
  lila: '#F5F3FF',
  rojo: '#FEE2E2',
  azul: '#DBEAFE',
  celeste: '#E0F2FE',
  verde: '#DCFCE7',
  amarillo: '#FEF9C3',
  naranja: '#FFEDD5',
  rosa: '#FCE7F3',
  gris: '#F3F4F6',
};

const DAY_WORDS: Record<string, string> = {
  lunes: 'lun',
  martes: 'mar',
  miercoles: 'mie',
  jueves: 'jue',
  viernes: 'vie',
  sabado: 'sab',
  domingo: 'dom',
};
const DAY_INDEX: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const DAY_NAMES: Record<string, string> = { lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado', dom: 'domingo' };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findProduct(inv: Inventory, text: string): InventoryProduct | undefined {
  const t = normalize(text);
  let best: { p: InventoryProduct; score: number } | undefined;
  for (const p of inv.products) {
    const words = normalize(p.name.split(',')[0]!).split(' ').filter((w) => w.length > 2 && w !== 'del');
    const stems = words.map((w) => w.replace(/(es|s)$/, ''));
    const score = stems.filter((s) => t.includes(s)).length / stems.length;
    if (score > 0 && (!best || score > best.score)) best = { p, score };
  }
  return best && best.score >= 0.5 ? best.p : undefined;
}

function money(n: number): string {
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** Next given weekday at 23:59 in Montevideo (UTC-3), as ISO with offset. */
export function nextWeekdayEnd(nowIso: string, dayWord: string): string {
  const target = DAY_INDEX[dayWord] ?? 0;
  const now = new Date(nowIso);
  const local = new Date(now.getTime() - 3 * 3600_000); // shift to Montevideo wall clock
  const diff = (target - local.getUTCDay() + 7) % 7;
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + diff));
  return `${d.toISOString().slice(0, 10)}T23:59:00-03:00`;
}

const baseOf = (p: Partial<Interpretation> & Pick<Interpretation, 'kind' | 'summary'>): Interpretation => ({
  confidence: 0.9,
  ops: [],
  needsCode: false,
  unexpressedParts: [],
  ...p,
});

/** Patterns for the fake classifier (Spanish and Portuguese, normalized without accents). */
const SECRETS = /(mostr|deci|pasa|revela|dame|manda)\w*\b.*\b(instruccion|instrucoes|variables de entorno|variaveis de ambiente|claves|senhas|tokens?|api key|chave da api|secretos?)/;
const NEW_THING =
  /(mercado ?pago|stripe|paypal|\bpix\b|pasarela|medio de pago|meio de pagamento|cobrar online|cobrar en linea|receber (os )?pagamentos|carrito|tienda online|loja online|suscripci|assinatura|\bagente\b|workflow|automatic|automatiz|\berp\b|facturaci|faturamento|nota fiscal|\bdgi\b|\bcrm\b|logistica|\bapp\b|aplicacion movil|aplicativo|cuentas de usuario|contas de usuario|tengan su cuenta|area privada|acumul\w* puntos|programa de puntos|fideliza|sincroni\w* .*(stock|estoque|inventario|sistema)|sistema de gestion|sistema de reservas|turnos online|agenda online)/;
const DELICATE =
  /(base de datos|banco de dados|\btabla|\btabela|migraci|migracao|supabase|endpoint|\bapi\b|backend|servidor|\blogin\b|iniciar sesion|contrasena|\bsenha|permis|admin|variables de entorno|variaveis de ambiente|\.env|dependenc|package\.json|librer|actualiza\w* (next|react|las librerias|el framework)|atualiz\w* (o next|as dependencias|as bibliotecas)|borra\w* (todos|todas|los|las) (pedidos|datos|usuarios|clientes)|apag\w* (todos|os) (pedidos|dados)|webhook|guard\w* (en|los|las) .*(base|supabase)|salv\w* .*(banco|base))/;
const SIMPLE_CODE =
  /(formulario|aviso|franja|seccion|secao|galeria|mapa|preguntas frecuentes|perguntas frequentes|footer|rodape|testimonios|depoimentos|tipograf|que la gente pueda reservar|reserva de tortas|pagina nueva|pagina de)/;

export function fakeInterpret(input: InterpretInput): Interpretation {
  const raw = input.text;
  const t = normalize(raw);
  const inv = input.inventory;
  const language = /\b(voce|voces|nao|obrigad|preco|cor do|fundo|sabado abrimos das|acabou|adicione|crie|mude|atualize|quero|integrar o|banco de dados|rodape)\b/.test(t) ? 'pt' : 'es';
  const base = (p: Partial<Interpretation> & Pick<Interpretation, 'kind' | 'summary'>): Interpretation => baseOf({ language, ...p });

  if (/^(si|sí|dale|ok|perfecto|listo|de una|sim|pode)[.!]*$/.test(t)) return base({ kind: 'aprobacion', summary: 'Aprueba' });
  if (/^(volve atras|deshace|deshacelo|volver atras|desfaz|volta como estava)/.test(t)) return base({ kind: 'revertir', summary: 'Vuelve atrás' });
  if (/^(hola|buenas|gracias|buen dia|buenas tardes|chau|ola|oi|obrigad\w*|valeu)\b/.test(t) && t.length < 30) {
    return base({ kind: 'charla', summary: 'Saluda' });
  }

  // Code or HTML in the request: the instruction part goes to unexpressed parts.
  const codeMatch = raw.match(/(agreg\S*|pon\S*|met\S*|coloque\S*|adicione\S*)[^<]*<[^>]+>.*$/i) ?? raw.match(/<[^>]+>.*$/);
  if (codeMatch) {
    const ops: Op[] = [];
    const price = t.match(/precio a \$?(\d+(?:[.,]\d+)?)/);
    const product = findProduct(inv, raw);
    if (price && product) ops.push({ type: 'set_price', productId: product.id, value: Number(price[1]!.replace(',', '.')) });
    return base({
      kind: 'simple',
      summary: 'Cambio un precio y agrego un script',
      confidence: product ? 0.7 : 0.4,
      ops,
      needsCode: true,
      codeInstruction: 'Agregar un script en el footer',
      unexpressedParts: [codeMatch[0]],
    });
  }

  if (SECRETS.test(t)) return base({ kind: 'bloqueado', summary: 'Pide datos internos', why: 'Pide secretos o instrucciones internas' });

  if (/\?\s*$/.test(raw) || /^(a que hora|cuando|cuanto|que precio|tienen|hay|abren|donde|que horas|quanto|voces|tem)\b/.test(t)) {
    return base({ kind: 'consulta', summary: 'Pregunta sobre la web' });
  }

  if (DELICATE.test(t)) {
    return base({
      kind: 'delicado',
      summary: 'Pide un cambio en una zona delicada',
      why: 'Toca la base de datos, el login, la API, los secretos o las dependencias',
      needsCode: true,
      codeInstruction: `Cambio pedido: ${raw.slice(0, 200)}`,
      unexpressedParts: [raw.slice(0, 200)],
    });
  }

  if (NEW_THING.test(t)) {
    return base({ kind: 'nuevo', summary: 'Pide algo nuevo', why: 'Es una integración, un medio de pago, un agente o un módulo grande' });
  }

  // Banner: "cartel de Black Friday con 25% de descuento en todo, hasta el domingo"
  if (/(cartel|banner)/.test(t)) {
    if (/(saca|quita|borra)/.test(t)) {
      return base({ kind: 'simple', summary: 'Saco el cartel', ops: [{ type: 'set_banner', enabled: false }] });
    }
    const pct = t.match(/(\d{1,2})\s*%/);
    const until = t.match(/hasta el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)/);
    const title = raw.match(/cartel de ([^,]+?)(?: con |,|$)/i)?.[1]?.trim() ?? 'Promo';
    const discount = pct ? Number(pct[1]) : null;
    const text = discount ? `${title}: ${discount}% de descuento en todo` : title;
    const op: Op = {
      type: 'set_banner',
      enabled: true,
      text,
      discountPercent: discount,
      startsAt: null,
      endsAt: until ? nextWeekdayEnd(input.now, until[1]!) : null,
    };
    return base({
      kind: 'simple',
      summary: `Pongo un cartel "${text}"${until ? ` hasta el ${until[1]}` : ''}`,
      ops: [op],
    });
  }

  // Percent adjust: "subí 10% todos los precios"
  const pct = t.match(/(subi|aumenta|baja|bajale|rebaja)\w*\s+(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) {
    const sign = /^(baja|rebaja)/.test(pct[1]!) ? -1 : 1;
    const percent = sign * Number(pct[2]!.replace(',', '.'));
    const cat = inv.categories.find((c) => t.includes(c) || t.includes(c.replace(/s$/, '')));
    const filter = /todo/.test(t) || !cat ? { all: true as const } : { category: cat };
    return base({
      kind: 'simple',
      summary: `${sign > 0 ? 'Subo' : 'Bajo'} ${Math.abs(percent)}% ${'all' in filter ? 'todos los precios' : `los precios de ${cat}`}, redondeando a múltiplos de 5`,
      ops: [{ type: 'adjust_prices', filter, percent, rounding: 'nearest_5' }],
    });
  }

  // Availability.
  if (/(no (tenemos|hay|queda)|se (acabo|acabaron|termino|terminaron)|sin stock|agotad)/.test(t)) {
    const p = findProduct(inv, raw);
    if (p) {
      return base({
        kind: 'simple',
        summary: `Marco ${p.name.toLowerCase()} como no disponible`,
        ops: [{ type: 'set_availability', productId: p.id, available: false }],
      });
    }
  }
  if (/(volvi(mos|o) a tener|ya hay|hay de nuevo|repusimos)/.test(t)) {
    const p = findProduct(inv, raw);
    if (p) {
      return base({
        kind: 'simple',
        summary: `Marco ${p.name.toLowerCase()} como disponible`,
        ops: [{ type: 'set_availability', productId: p.id, available: true }],
      });
    }
  }

  // Ambiguous (phase 2): "poné el fondo más oscuro" → two options.
  if (/fondo mas oscuro/.test(t) && inv.colors.some((c) => c.token === 'background')) {
    return base({
      kind: 'simple',
      summary: 'Oscurezco el fondo',
      confidence: 0.7,
      options: [
        { label: 'Crema tostado', ops: [{ type: 'set_color', token: 'background', value: '#F5E6D3' }] },
        { label: 'Gris piedra', ops: [{ type: 'set_color', token: 'background', value: '#E7E5E4' }] },
      ],
    });
  }

  // Color: "poné el fondo violeta", "cambiá el título a naranja", "poné los botones en verde"
  const colorWord = Object.keys(COLORS).find((c) => t.includes(normalize(c)));
  const hex = raw.match(/#[0-9a-f]{6}\b/i)?.[0];
  if ((colorWord || hex) && /(fondo|color|principal|acento|boton|titulo|texto|letra)/.test(t)) {
    const has = (tok: string) => inv.colors.some((c) => c.token === tok);
    const wanted = /fondo/.test(t)
      ? 'background'
      : /acento/.test(t)
        ? 'accent'
        : /boton/.test(t)
          ? 'button'
          : /titulo/.test(t)
            ? 'title'
            : /(texto|letra)/.test(t)
              ? 'text'
              : 'primary';
    const token = has(wanted) ? wanted : wanted === 'button' || wanted === 'title' ? 'primary' : wanted;
    if (has(token)) {
      const tone = token === 'background' ? BACKGROUND_TINTS : token === 'button' ? BUTTON_TONES : {};
      const value = (hex ?? tone[colorWord!] ?? COLORS[colorWord!]!).toUpperCase();
      const label = COLOR_LABELS[token] ?? 'el color principal';
      const ops: Op[] = [{ type: 'set_color', token, value }];
      if (token === 'button' && colorWord && LIGHT.has(colorWord) && has('buttonText')) ops.push({ type: 'set_color', token: 'buttonText', value: '#1C1917' });
      return base({ kind: 'simple', summary: `Pongo ${label} ${colorWord ?? value}`, ops });
    }
  }

  // Single price: "subí el pan flauta a 95"
  const priceMatch = t.match(/\ba \$?(\d+(?:[.,]\d{1,2})?)\b/);
  if (priceMatch && /(subi|baja|pone|cambia|deja|actualiza|precio|sale)/.test(t)) {
    const p = findProduct(inv, raw);
    const value = Number(priceMatch[1]!.replace(',', '.'));
    if (p) {
      return base({
        kind: 'simple',
        summary: `${value >= p.price ? 'Subo' : 'Bajo'} ${p.name.toLowerCase()} de ${money(p.price)} a ${money(value)}`,
        ops: [{ type: 'set_price', productId: p.id, value }],
      });
    }
  }

  // Hours: "el sábado abrimos de 8 a 14"
  const hours = t.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo).*?de (\d{1,2})(?::(\d{2}))? a (\d{1,2})(?::(\d{2}))?/);
  if (hours) {
    const day = DAY_WORDS[hours[1]!] as 'lun';
    const hhmm = (h: string, m?: string) => `${h.padStart(2, '0')}:${m ?? '00'}`;
    const open = hhmm(hours[2]!, hours[3]);
    const close = hhmm(hours[4]!, hours[5]);
    return base({
      kind: 'simple',
      summary: `Cambio el horario del ${hours[1]} a ${open}–${close}`,
      ops: [{ type: 'set_hours', day, open, close }],
    });
  }

  // Show or hide a section of the inventory by its usual name.
  const sectionMove = t.match(/(saca|oculta|esconde|quita|volve a mostrar|mostra|pone)\w*\b.*\bseccion\b/);
  if (sectionMove && inv.sections) {
    const names: Record<string, string[]> = { about: ['quienes somos', 'nosotros', 'about'], hours: ['horario'], contact: ['contacto'] };
    const found = inv.sections.find((x) => (names[x.section] ?? [x.section]).some((n) => t.includes(n)));
    if (found) {
      const visible = /^(volve|mostra|pone)/.test(sectionMove[1]!);
      return base({ kind: 'simple', summary: `${visible ? 'Muestro' : 'Oculto'} la sección ${found.section}`, ops: [{ type: 'toggle_section', section: found.section, visible }] });
    }
  }

  // Interface changes the operations don't cover go to the agent: simple by intention.
  if (SIMPLE_CODE.test(t)) {
    return base({
      kind: 'simple',
      summary: 'Agrego lo que pide en la web',
      why: 'Es un cambio de interfaz',
      needsCode: true,
      codeInstruction: `Cambio de interfaz: ${raw.slice(0, 200)}`,
      unexpressedParts: [raw.slice(0, 200)],
    });
  }

  return base({ kind: 'simple', summary: 'No terminé de entender el pedido', confidence: 0.3 });
}

export function fakeAnswer(inv: Inventory, text: string): string {
  const t = normalize(text);
  const dayWord = Object.keys(DAY_WORDS).find((d) => t.includes(d));
  if (dayWord && inv.hours) {
    const h = inv.hours.find((x) => x.day === DAY_WORDS[dayWord]);
    if (h) {
      return h.open && h.close
        ? `El ${DAY_NAMES[h.day]} abrimos de ${h.open} a ${h.close}.`
        : `El ${DAY_NAMES[h.day]} está cerrado.`;
    }
  }
  const p = findProduct(inv, text);
  if (p) return p.available ? `${p.name} sale ${money(p.price)}.` : `${p.name} hoy no está disponible.`;
  return 'No encontré eso en la web. Se lo pregunto a tu agencia.';
}

export function createFakeProvider(): AiProvider {
  return {
    name: 'fake',
    async interpret(input) {
      return { interpretation: fakeInterpret(input), usage: EMPTY_USAGE() };
    },
    async answerConsulta({ inventory, text }) {
      return { answer: fakeAnswer(inventory, text), usage: EMPTY_USAGE() };
    },
    async draftQuote({ text, pastQuotes }) {
      const avg = pastQuotes.length > 0 ? pastQuotes.reduce((s, q) => s + q.amountUsd, 0) / pastQuotes.length : 300;
      const title = text.length > 60 ? `${text.slice(0, 57)}…` : text;
      return {
        quote: { title, description: `Borrador automático para: ${text}`, amountUsd: Math.round(avg), etaDays: 5 },
        usage: EMPTY_USAGE(),
      };
    },
    async transcribe() {
      throw new Error('El proveedor falso no transcribe audios');
    },
  };
}
