import type { Category } from './types.ts';

/**
 * User-facing texts (SPEC §12). Rioplatense Spanish with voseo, short.
 * `a` is always the assistant name, e.g. "el asistente de Estudio Faro".
 */

export const buttons = {
  dale: 'Dale',
  noEraEso: 'No era eso',
  volver: 'Volver a como estaba',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  verPanel: 'Ver en el panel',
  aprobarYHacer: 'Aprobar y hacer',
  verPreview: 'Ver vista previa',
  verPr: 'Ver PR',
  publicar: 'Publicar',
  descartar: 'Descartar',
  aceptar: 'Aceptar',
  ahoraNo: 'Ahora no',
} as const;

export const copy = {
  bienvenida: (a: string) =>
    `¡Hola! Soy ${a}. Escribime lo que quieras cambiar en tu web, como se lo pedirías a una persona.`,
  recibido: () => 'Recibido, ya lo veo.',
  entendido: (resumen: string) => `Entendí: ${resumen}. Armo la vista previa…`,
  vistaPrevia: (resumen: string) => `¿Así? ${resumen}`,
  noEraEso: () => 'Perdón. Contame qué cambiarías y lo rehago.',
  publicado: () => 'Listo, ya está publicado.',
  revertido: () => 'Listo, volvió a como estaba.',
  esperaAgencia: (agencia: string, razon: string) =>
    `Esto lo aprueba ${agencia} porque ${razon}. Te aviso apenas esté.`,
  aprobadoAgencia: (agencia: string) => `${agencia} lo aprobó y ya está publicado.`,
  publicandoCodigo: (agencia: string) => `${agencia} lo aprobó. Se está publicando: tarda un minuto o dos y te aviso cuando esté en la web.`,
  revirtiendoCodigo: () => 'Lo estoy volviendo atrás: tarda un minuto o dos y te aviso cuando esté.',
  /** Simple change by code: the agent prepares it and the client gets the preview, without the agency. */
  preparandoCambio: () => 'Lo preparo y te mando la vista previa apenas esté. Tarda un par de minutos.',
  /** Delicate change by code: the agent prepares it and the agency reviews it before the client sees the preview. */
  preparandoCodigo: (agencia: string) =>
    `Esto toca una parte delicada de tu web. Lo preparo y ${agencia} lo revisa antes de mostrártelo. Te aviso apenas esté.`,
  /** Double classification: the diff touched a delicate zone, so a simple request goes to the agency. */
  pasaADelicado: (agencia: string) =>
    `Al prepararlo vi que toca una parte delicada de tu web, así que antes de mostrártelo lo revisa ${agencia}. Te aviso apenas esté.`,
  /** Ambiguity goes to the client, never to the agency. */
  pedirDetalle: () => 'Para hacerlo bien me falta un dato. ¿Me contás un poco más qué querés cambiar y cómo?',
  yaEstaAsi: () => 'Revisé tu web y eso ya está así. Si querés otra cosa, contame qué cambiarías.',
  /** The preview the client gets once the agency approved (risky content or code). */
  revisadoAgencia: (agencia: string, resumen: string) => `${agencia} ya lo revisó. ¿Así? ${resumen}`,
  publicandoCambio: () => 'Se está publicando: tarda un minuto y te aviso cuando esté en la web.',
  demoraPublicacion: (agencia: string) => `El cambio ya está hecho, pero la web tarda más de lo normal en actualizarse. Se lo aviso a ${agencia}.`,
  yaEstaba: (agencia: string) => `Revisé tu web y eso ya está así. Si querés algo distinto, contame qué cambiarías; si no, se lo comento a ${agencia}.`,
  agenciaYaEstaba: (shortId: string, detalle: string) => `#${shortId}: el agente revisó el código y no hizo falta cambiar nada. ${detalle}`,
  loApruebaAgencia: (agencia: string) => `Ese cambio lo aprueba ${agencia}. Ya les avisé; te escribo apenas esté.`,
  algoNuevo: (agencia: string) =>
    `Eso es algo nuevo para tu web. Te armo un presupuesto con alcance, plazo y precio; lo revisa ${agencia} y te lo mando por acá.`,
  presupuesto: (agencia: string, titulo: string, monto: number, dias: number) =>
    `Presupuesto de ${agencia}: ${titulo}. USD ${formatAmount(monto)}, ${dias} días.`,
  /** The quote with its scope and the deposit, with [Aceptar] [Ahora no]. */
  presupuestoConSena: (agencia: string, titulo: string, monto: number, dias: number, alcance: string, sena: number) =>
    `Presupuesto de ${agencia}: ${titulo}.\n${alcance}\nPlazo: ${dias} días. Precio: USD ${formatAmount(monto)}, con una seña de USD ${formatAmount(sena)} para arrancar.`,
  linkSena: (monto: number, url: string) => `¡Genial! Para arrancar, pagá la seña de USD ${formatAmount(monto)} acá: ${url}`,
  pagoDePrueba: () => 'Es un link de prueba: todavía no se cobra nada.',
  bloqueado: (agencia: string) => `Eso no lo puedo hacer desde acá. Se lo paso a ${agencia}.`,
  derivado: () => 'No pude hacerlo solo, se lo pasé a tu equipo. Te escriben en breve.',
  colaLlena: () => 'Estoy con mucho trabajo. En un ratito lo veo.',
  noHabilitado: () => 'Este chat no está habilitado. Pedile el link a tu agencia.',
  soloTexto: () => 'Por ahora describímelo con palabras.',
  audioSinTranscripcion: () => 'Todavía no puedo escuchar audios: falta configurar la transcripción. ¿Me lo escribís?',
  audioNoEntendido: () => 'No pude entender el audio. ¿Me lo escribís?',
  transcripcion: (texto: string) => `🎙️ ${texto}`,
  invitacionInvalida: () => 'Ese link no es válido o ya venció. Pedile uno nuevo a tu agencia.',
  /** To the agency, in its Telegram. */
  agenciaAprobacion: (cliente: string, resumen: string, razon: string) =>
    `Pedido de ${cliente}: ${resumen}. Necesita tu aprobación porque ${razon}.`,
  // Worker texts beyond the SPEC §12 table (moved from apps/worker/src/texts.ts).

  rechazadoAgencia: (agencia: string) => `${agencia} prefirió no hacer este cambio. Si querés, contámelo de otra forma.`,
  conflictoRevertir: (agencia: string) =>
    `Eso cambió de nuevo después, así que no lo puedo volver atrás solo. Se lo paso a ${agencia}.`,
  nadaPendiente: () => 'No tengo nada pendiente para aprobar. Contame qué querés cambiar.',
  nadaParaVolver: () => 'No encontré un cambio reciente para volver atrás.',
  charlaGracias: () => '¡De nada! Cuando quieras cambiar algo de tu web, escribime.',
  charla: () => 'Acá estoy. Contame qué querés cambiar de tu web y lo preparo.',
  presupuestoAceptado: (agencia: string) => `¡Genial! Le aviso a ${agencia} para arrancar.`,
  presupuestoAhoraNo: () => 'Dale, queda para más adelante.',
  opcion: (n: number, label: string) => `Opción ${n}: ${label}`,
  elegiUna: () => 'Lo entendí de dos formas. Elegí la que va y la publico.',
  linkVistaPrevia: (url: string) => `Vista previa: ${url}`,
  limitePedidos: () => 'Me mandaste muchos pedidos seguidos. Dame unos minutos y lo veo.',
  /** To the agency (worker). */
  agenciaBloqueado: (cliente: string, resumen: string, razones: string) =>
    `Pedido bloqueado de ${cliente}: ${resumen}. Razones: ${razones}.`,
  agenciaDerivado: (cliente: string, shortId: string, resumen: string, motivo: string) =>
    `No pude resolver solo el pedido #${shortId} de ${cliente}: ${resumen}. Motivo: ${motivo}.`,
  agenciaCodigo: (cliente: string, resumen: string, ficha: string, razon: string) =>
    `Pedido de ${cliente}: ${resumen}. Necesita tu aprobación porque ${razon}.\nFicha para el agente: ${ficha}`,
  agenciaNuevo: (cliente: string, resumen: string, titulo: string, monto: number, dias: number) =>
    `Pedido de ${cliente}: ${resumen}. Es algo nuevo. Armé un borrador de presupuesto: ${titulo}, USD ${formatAmount(monto)}, ${dias} días. Revisalo y mandalo desde el panel.`,
  agenciaAgenteListo: (shortId: string, resumen: string) =>
    `Listo el cambio de código de #${shortId}: ${resumen}. Revisá el PR y aprobalo: después el cliente ve la vista previa y lo publica.`,
  agenciaPasaADelicado: (shortId: string, resumen: string, razones: string) =>
    `#${shortId}: «${resumen}» parecía un cambio simple, pero el diff toca zonas delicadas (${razones}). Revisá el PR y aprobalo: después el cliente ve la vista previa y lo publica.`,
  agenciaSena: (cliente: string, titulo: string, monto: number) =>
    `${cliente} aceptó el presupuesto «${titulo}». Le mandé el link de la seña de USD ${formatAmount(monto)} (de prueba: todavía no se cobra).`,
  agenciaPublicado: (shortId: string) => `Publicado #${shortId}.`,
  agenciaPresupuesto: (cliente: string, titulo: string, aceptado: boolean) =>
    `${cliente} ${aceptado ? 'aceptó' : 'dejó para más adelante'} el presupuesto: ${titulo}.`,
  agenciaConflicto: (shortId: string, pointers: string) =>
    `El cliente pidió volver atrás #${shortId}, pero esos valores cambiaron después (${pointers}). Revisalo en el panel.`,
} as const;

/** Names of the categories, for the panel, the rules simulator and messages to the agency. */
export const CATEGORY_LABELS: Record<Category, string> = {
  consulta: 'Consulta',
  simple: 'Cambio simple',
  delicado: 'Cambio delicado',
  nuevo: 'Algo nuevo',
  bloqueado: 'Bloqueado',
  charla: 'Charla',
  derivado: 'Derivado',
};

/** Warnings for the client next to a preview ("Ojo: …"). Empty string when there are none. */
export function warningsBlock(warnings: readonly string[]): string {
  const list = warnings.map((w) => w.trim()).filter(Boolean);
  return list.length ? `Ojo:\n${list.map((w) => `• ${w}`).join('\n')}` : '';
}

/** A message plus an optional block, separated by a newline. */
export function withBlock(text: string, block: string): string {
  return block ? `${text}\n${block}` : text;
}

/** Assistant name shown to clients: never "Walt" nor "Claude". */
export function assistantName(agencyName: string): string {
  return `el asistente de ${agencyName}`;
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Lowercases the first letter so a reason reads well after "porque". */
export function asClause(reason: string): string {
  const r = reason.trim().replace(/\.$/, '');
  return r.charAt(0).toLowerCase() + r.slice(1);
}
