/**
 * Worker texts that are not in `@dale/core/copy` yet. Rioplatense Spanish, voseo, short.
 * TODO(90): move them to `@dale/core/copy` (pedido de 01-worker).
 */
export const extra = {
  rechazadoAgencia: (agencia: string) => `${agencia} prefirió no hacer este cambio. Si querés, contámelo de otra forma.`,
  conflictoRevertir: (agencia: string) =>
    `Eso cambió de nuevo después, así que no lo puedo volver atrás solo. Se lo paso a ${agencia}.`,
  nadaPendiente: () => 'No tengo nada pendiente para aprobar. Contame qué querés cambiar.',
  nadaParaVolver: () => 'No encontré un cambio reciente para volver atrás.',
  charlaGracias: () => '¡De nada! Cuando quieras cambiar algo de tu web, escribime.',
  charla: () => 'Acá estoy. Contame qué querés cambiar de tu web y lo preparo.',
  presupuestoAceptado: (agencia: string) => `¡Genial! Le aviso a ${agencia} para arrancar.`,
  presupuestoAhoraNo: () => 'Dale, queda para más adelante.',
  linkVistaPrevia: (url: string) => `Vista previa: ${url}`,
  limitePedidos: () => 'Me mandaste muchos pedidos seguidos. Dame unos minutos y lo veo.',
  // To the agency.
  agenciaBloqueado: (cliente: string, resumen: string, razones: string) =>
    `Pedido bloqueado de ${cliente}: ${resumen}. Razones: ${razones}.`,
  agenciaDerivado: (cliente: string, shortId: string, resumen: string, motivo: string) =>
    `No pude resolver solo el pedido #${shortId} de ${cliente}: ${resumen}. Motivo: ${motivo}.`,
  agenciaCodigo: (cliente: string, resumen: string, ficha: string, razon: string) =>
    `Pedido de ${cliente}: ${resumen}. Necesita tu aprobación porque ${razon}.\nFicha para el agente: ${ficha}`,
  agenciaFueraDeAlcance: (cliente: string, resumen: string, titulo: string, monto: number, dias: number) =>
    `Pedido de ${cliente}: ${resumen}. Es una función nueva. Armé un borrador de presupuesto: ${titulo}, USD ${monto}, ${dias} días. Revisalo y mandalo desde el panel.`,
  agenciaAgenteListo: (shortId: string, resumen: string) => `Listo el cambio de código de #${shortId}: ${resumen}. Revisalo y publicalo.`,
  agenciaPublicado: (shortId: string) => `Publicado #${shortId}.`,
  agenciaPresupuesto: (cliente: string, titulo: string, aceptado: boolean) =>
    `${cliente} ${aceptado ? 'aceptó' : 'dejó para más adelante'} el presupuesto: ${titulo}.`,
  agenciaConflicto: (shortId: string, pointers: string) =>
    `El cliente pidió volver atrás #${shortId}, pero esos valores cambiaron después (${pointers}). Revisalo en el panel.`,
} as const;
