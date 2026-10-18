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
  /** Code lane: the agent prepares it and the agency reviews it before the client sees the preview. */
  preparandoCodigo: (agencia: string) =>
    `Esto lleva cambios en el código. Lo preparo y ${agencia} lo revisa antes de mostrártelo. Te aviso apenas esté.`,
  /** The preview the client gets once the agency approved (risky content or code). */
  revisadoAgencia: (agencia: string, resumen: string) => `${agencia} ya lo revisó. ¿Así? ${resumen}`,
  publicandoCambio: () => 'Se está publicando: tarda un minuto y te aviso cuando esté en la web.',
  demoraPublicacion: (agencia: string) => `El cambio ya está hecho, pero la web tarda más de lo normal en actualizarse. Se lo aviso a ${agencia}.`,
  loApruebaAgencia: (agencia: string) => `Ese cambio lo aprueba ${agencia}. Ya les avisé; te escribo apenas esté.`,
  fueraDeAlcance: (agencia: string) =>
    `Eso es algo nuevo para tu web. Se lo paso a ${agencia} para que te mande un presupuesto.`,
  presupuesto: (agencia: string, titulo: string, monto: number, dias: number) =>
    `Presupuesto de ${agencia}: ${titulo}. USD ${formatAmount(monto)}, ${dias} días.`,
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
  agenciaFueraDeAlcance: (cliente: string, resumen: string, titulo: string, monto: number, dias: number) =>
    `Pedido de ${cliente}: ${resumen}. Es una función nueva. Armé un borrador de presupuesto: ${titulo}, USD ${monto}, ${dias} días. Revisalo y mandalo desde el panel.`,
  agenciaAgenteListo: (shortId: string, resumen: string) =>
    `Listo el cambio de código de #${shortId}: ${resumen}. Revisá el PR y aprobalo: después el cliente ve la vista previa y lo publica.`,
  agenciaPublicado: (shortId: string) => `Publicado #${shortId}.`,
  agenciaPresupuesto: (cliente: string, titulo: string, aceptado: boolean) =>
    `${cliente} ${aceptado ? 'aceptó' : 'dejó para más adelante'} el presupuesto: ${titulo}.`,
  agenciaConflicto: (shortId: string, pointers: string) =>
    `El cliente pidió volver atrás #${shortId}, pero esos valores cambiaron después (${pointers}). Revisalo en el panel.`,
} as const;

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
