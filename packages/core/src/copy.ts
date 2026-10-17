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
  fueraDeAlcance: (agencia: string) =>
    `Eso es algo nuevo para tu web. Se lo paso a ${agencia} para que te mande un presupuesto.`,
  presupuesto: (agencia: string, titulo: string, monto: number, dias: number) =>
    `Presupuesto de ${agencia}: ${titulo}. USD ${formatAmount(monto)}, ${dias} días.`,
  bloqueado: (agencia: string) => `Eso no lo puedo hacer desde acá. Se lo paso a ${agencia}.`,
  derivado: () => 'No pude hacerlo solo, se lo pasé a tu equipo. Te escriben en breve.',
  colaLlena: () => 'Estoy con mucho trabajo. En un ratito lo veo.',
  noHabilitado: () => 'Este chat no está habilitado. Pedile el link a tu agencia.',
  soloTexto: () => 'Por ahora describímelo con palabras.',
  audioSinTranscripcion: () => 'Por ahora mandámelo escrito.',
  invitacionInvalida: () => 'Ese link no es válido o ya venció. Pedile uno nuevo a tu agencia.',
  /** To the agency, in its Telegram. */
  agenciaAprobacion: (cliente: string, resumen: string, razon: string) =>
    `Pedido de ${cliente}: ${resumen}. Necesita tu aprobación porque ${razon}.`,
} as const;

/** Assistant name shown to clients: never "Dale" nor "Claude". */
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
