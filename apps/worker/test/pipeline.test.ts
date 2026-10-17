import { createFakeProvider, type AiProvider } from '@dale/ai';
import { copy, SEED_IDS, type Category, type RequestStatus } from '@dale/core';
import { describe, expect, it } from 'vitest';
import { CommandPoller } from '../src/commands.js';
import { FakeSiteRepo } from '../src/site/repo.js';
import { AGENCY_CHAT, aiWith, CLIENT_CHAT, harness, livePrice, okAgent, SECRET } from './helpers.js';

const lastReq = (h: Awaited<ReturnType<typeof harness>>) => h.store.requests.at(-1)!;

describe('casos de la demo (SPEC §1) por el pipeline', () => {
  const cases: [string, Category, RequestStatus][] = [
    ['subí el pan flauta a 95', 'permitido', 'esperando_cliente'],
    ['subí 10% todos los precios', 'permitido', 'esperando_cliente'],
    ['no tenemos más medialunas hoy', 'permitido', 'esperando_cliente'],
    ['poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo', 'riesgoso', 'esperando_agencia'],
    ['cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>', 'bloqueado', 'bloqueado'],
    ['¿a qué hora abren el domingo?', 'consulta', 'respondido'],
    ['quiero que la gente pueda reservar tortas online', 'fuera_de_alcance', 'cotizado'],
    ['poné el fondo violeta', 'permitido', 'esperando_cliente'],
  ];
  it.each(cases)('%s → %s', async (text, category, status) => {
    const h = await harness();
    await h.say(text);
    const req = lastReq(h);
    expect(req.category).toBe(category);
    expect(req.status).toBe(status);
    // Recibido first, and never left without an answer after it.
    const toClient = h.textsTo(CLIENT_CHAT);
    expect(toClient[0]).toBe(copy.recibido());
    expect(toClient.length).toBeGreaterThan(1);
    // Events: recibido, interpretado and decidido always.
    const steps = h.store.events.filter((e) => e.request_id === req.id && e.status === 'ok').map((e) => e.step);
    expect(steps).toEqual(expect.arrayContaining(['recibido', 'interpretado', 'decidido']));
    // Every message is saved.
    expect(h.store.messages.filter((m) => m.direction === 'salida').length).toBe(h.channel.sent.length);
  });

  it('el script nunca llega al contenido', async () => {
    const h = await harness();
    await h.say('cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>');
    expect(JSON.stringify(h.store.versions.map((v) => v.content))).not.toContain('script');
    expect(h.last(AGENCY_CHAT)).toMatch(/bloqueado/i);
  });
});

describe('permitido: borrador, aprobación, publicación y vuelta atrás', () => {
  it('publica con el botón y vuelve atrás con otro', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    const req = lastReq(h);
    expect(h.channel.lastButton(CLIENT_CHAT, 'ok:')).toBe(`ok:${req.short_id}`);
    expect(h.last()).toContain('https://sitio.example/?preview=');
    expect(livePrice(h.store, 'pan-flauta')).toBe(80);

    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('publicado');
    expect(livePrice(h.store, 'pan-flauta')).toBe(95);
    expect(h.last()).toBe(copy.publicado());
    expect(h.repo.commits.at(-1)!.message).toMatch(new RegExp(`^dale: .* \\(#${req.short_id}\\)$`));
    // The previewed draft is the version that went live.
    expect(h.store.versions.find((v) => v.status === 'viva')!.id).toBe(req.draft_version_id);
    expect(h.store.approvals).toEqual([expect.objectContaining({ actor: 'cliente', decision: 'aprobado', via: 'telegram' })]);

    await h.press(`undo:${req.short_id}`);
    expect(livePrice(h.store, 'pan-flauta')).toBe(80);
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('revertido');
    expect(h.last()).toBe(copy.revertido());
    expect(h.repo.commits.at(-1)!.message).toBe(`dale: revert #${req.short_id}`);
    expect(h.store.versions.filter((v) => v.status === 'viva')).toHaveLength(1);
  });

  it('un doble toque en Dale publica una sola vez', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    const req = lastReq(h);
    await Promise.all([h.press(`ok:${req.short_id}`), h.press(`ok:${req.short_id}`)]);
    expect(h.repo.commits).toHaveLength(1);
  });

  it('"sí" escrito aprueba el pedido abierto sin crear otro', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    await h.say('sí, dale');
    expect(h.store.requests).toHaveLength(1);
    expect(livePrice(h.store, 'pan-flauta')).toBe(95);
    await h.say('volvé atrás');
    expect(livePrice(h.store, 'pan-flauta')).toBe(80);
  });

  it('"No era eso" descarta el borrador y el mensaje siguiente es una corrección', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    const first = lastReq(h);
    await h.press(`no:${first.short_id}`);
    expect(h.last()).toBe(copy.noEraEso());
    expect(h.store.versions.find((v) => v.id === first.draft_version_id)!.status).toBe('descartada');
    await h.say('subí la baguette a 95');
    const second = lastReq(h);
    expect(second.parent_request_id).toBe(first.id);
    expect(second.status).toBe('esperando_cliente');
  });

  it('si el commit falla la versión queda viva, se guarda git_error y reintentar_commit lo arregla', async () => {
    const failing = new FakeSiteRepo(null, `fallo con ${SECRET}`);
    const h = await harness({ repo: failing });
    await h.say('subí el pan flauta a 95');
    const req = lastReq(h);
    await h.press(`ok:${req.short_id}`);
    expect(livePrice(h.store, 'pan-flauta')).toBe(95);
    const live = h.store.versions.find((v) => v.status === 'viva')!;
    expect(live.git_error).toContain('[secreto]');
    expect(live.git_error).not.toContain(SECRET);
    expect(h.store.events.some((e) => e.step === 'commit' && e.status === 'falla')).toBe(true);
    expect(h.last()).toBe(copy.publicado());

    // Fix the repo and retry from the panel.
    (failing as unknown as { failWith: string | null }).failWith = null;
    h.store.addCommand({ type: 'reintentar_commit', request_id: req.id });
    await new CommandPoller(h.store, h.worker, [SECRET], () => {}).tick();
    expect(h.store.commands[0]!.status).toBe('hecho');
    expect(h.store.versions.find((v) => v.status === 'viva')!.git_commit_sha).toBeTruthy();
    expect(h.store.versions.find((v) => v.status === 'viva')!.git_error).toBeNull();
  });

  it('volver atrás con conflicto avisa y no toca nada', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    const a = lastReq(h);
    await h.press(`ok:${a.short_id}`);
    await h.say('subí el pan flauta a 100');
    await h.press(`ok:${lastReq(h).short_id}`);
    await h.press(`undo:${a.short_id}`);
    expect(livePrice(h.store, 'pan-flauta')).toBe(100);
    expect(h.last(AGENCY_CHAT)).toContain('/products/0/price');
  });
});

describe('riesgoso de contenido: aprueba la agencia', () => {
  it('por Telegram', async () => {
    const h = await harness();
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    expect(h.last()).toMatch(/^Esto lo aprueba Estudio Faro porque/);
    expect(h.channel.lastButton(AGENCY_CHAT, 'gok:')).toBe(`gok:${req.short_id}`);
    // The client cannot approve for the agency.
    await h.press(`gok:${req.short_id}`, CLIENT_CHAT);
    expect(h.store.requests[0]!.status).toBe('esperando_agencia');
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]!.status).toBe('publicado');
    expect(h.last()).toBe(copy.aprobadoAgencia('Estudio Faro'));
    const banner = (h.store.versions.find((v) => v.status === 'viva')!.content as { banner: { enabled: boolean; endsAt: string } }).banner;
    expect(banner).toMatchObject({ enabled: true, endsAt: '2026-10-18T23:59:00-03:00' });
  });

  it('por comando del panel', async () => {
    const h = await harness();
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    h.store.addCommand({ type: 'aprobar', request_id: req.id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.commands[0]!.status).toBe('hecho');
    expect(h.store.requests[0]!.status).toBe('publicado');
    expect(h.store.approvals.at(-1)).toMatchObject({ actor: 'agencia', via: 'panel' });

    h.store.addCommand({ type: 'revertir', request_id: req.id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.requests[0]!.status).toBe('revertido');
  });

  it('rechazo del panel avisa al cliente', async () => {
    const h = await harness();
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    h.store.addCommand({ type: 'rechazar', request_id: lastReq(h).id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.requests[0]!.status).toBe('rechazado');
    expect(h.last()).toMatch(/prefirió no hacer este cambio/);
  });

  it('un comando sobre un pedido que no corresponde queda en error', async () => {
    const h = await harness();
    await h.say('¿a qué hora abren el domingo?');
    h.store.addCommand({ type: 'aprobar', request_id: lastReq(h).id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.commands[0]).toMatchObject({ status: 'error' });
  });
});

describe('fuera de alcance, consulta, bloqueado y derivado', () => {
  it('presupuesto: borrador, envío desde el panel y aceptación', async () => {
    const h = await harness();
    await h.say('quiero que la gente pueda reservar tortas online');
    const req = lastReq(h);
    expect(h.store.quotes[0]).toMatchObject({ status: 'borrador', request_id: req.id });
    expect(h.last()).toBe(copy.fueraDeAlcance('Estudio Faro'));
    expect(h.last(AGENCY_CHAT)).toMatch(/borrador de presupuesto/);

    h.store.addCommand({ type: 'enviar_presupuesto', request_id: req.id, payload: { amount_usd: 450, eta_days: 7 } });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.last()).toMatch(/^Presupuesto de Estudio Faro: .*USD 450, 7 días\.$/);
    await h.press(`qok:${req.short_id}`);
    expect(h.store.quotes[0]!.status).toBe('aceptado');
    expect(h.last(AGENCY_CHAT)).toMatch(/aceptó el presupuesto/);
  });

  it('consulta con lo que dice la web', async () => {
    const h = await harness();
    await h.say('¿a qué hora abren el domingo?');
    expect(h.last()).toBe('El domingo abrimos de 08:00 a 13:00.');
  });

  it('si la IA falla, el pedido queda derivado y todos avisados', async () => {
    const broken: AiProvider = { ...createFakeProvider(), interpret: async () => Promise.reject(new Error(`boom ${SECRET}`)) };
    const h = await harness({ ai: broken });
    await h.say('subí el pan flauta a 95');
    const req = lastReq(h);
    expect(req.status).toBe('derivado');
    expect(req.error).not.toContain(SECRET);
    expect(h.last()).toBe(copy.derivado());
    expect(h.last(AGENCY_CHAT)).toMatch(/No pude resolver solo/);
    expect(h.store.events.some((e) => e.step === 'interpretado' && e.status === 'falla')).toBe(true);
  });

  it('un pedido sin operaciones concretas queda derivado', async () => {
    const h = await harness();
    await h.say('hacé que se vea más lindo');
    expect(lastReq(h).status).toBe('derivado');
    expect(h.last()).toBe(copy.derivado());
  });
});

describe('riesgoso de código: cola lenta y @dale/agent', () => {
  const needsCode = aiWith((t) =>
    t.includes('mapa') ? { kind: 'cambio', summary: 'Agrego un mapa en contacto', ops: [], needsCode: true, codeInstruction: 'Agregar un mapa embebido en la sección de contacto', unexpressedParts: ['un mapa'], confidence: 0.9 } : null,
  );

  it('con el stub del agente queda derivado', async () => {
    const h = await harness({ ai: needsCode });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'riesgoso', lane: 'codigo', status: 'esperando_agencia' });
    expect(h.channel.lastButton(AGENCY_CHAT, 'gok:')).toBe(`gok:${req.short_id}`);
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]!.status).toBe('derivado');
    expect(h.last()).toBe(copy.derivado());
  });

  it('con un agente que anda: PR, publicar y revertir', async () => {
    const agent = okAgent();
    const h = await harness({ ai: needsCode, agent });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]).toMatchObject({ status: 'agente_listo', pr_number: 7, preview_url: 'https://preview.example' });
    expect(agent.calls[0]).toBe('run:Agregar un mapa embebido en la sección de contacto');
    await h.press(`pub:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]!.status).toBe('publicado');
    await h.press(`undo:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('revertido');
    expect(agent.calls).toEqual(['run:Agregar un mapa embebido en la sección de contacto', 'merge:7', 'revert:m1']);
  });
});

describe('acceso y límites (SPEC §9, §12)', () => {
  it('un chat sin vincular no pasa', async () => {
    const h = await harness();
    await h.worker.handle({ kind: 'text', chatId: 999, fromName: 'x', text: 'hola' });
    expect(h.last(999)).toBe(copy.noHabilitado());
    expect(h.store.requests).toHaveLength(0);
  });

  it('/start con invitación vincula el chat, con vencimiento y usos', async () => {
    const h = await harness();
    h.store.invites.push({ token: 'tok-ok', project_id: SEED_IDS.project, role: 'cliente', max_uses: 1, uses: 0, expires_at: '2099-01-01T00:00:00Z' });
    h.store.invites.push({ token: 'tok-viejo', project_id: SEED_IDS.project, role: 'cliente', max_uses: 5, uses: 0, expires_at: '2020-01-01T00:00:00Z' });
    await h.worker.handle({ kind: 'start', chatId: 500, fromName: 'Nueva', token: 'tok-ok' });
    expect(h.last(500)).toBe(copy.bienvenida('el asistente de Estudio Faro'));
    await h.worker.handle({ kind: 'start', chatId: 501, fromName: 'Otra', token: 'tok-ok' });
    expect(h.last(501)).toBe(copy.invitacionInvalida());
    await h.worker.handle({ kind: 'start', chatId: 502, fromName: 'Otra', token: 'tok-viejo' });
    expect(h.last(502)).toBe(copy.invitacionInvalida());
    expect((await h.store.getContactByChat(500))?.role).toBe('cliente');
  });

  it('descarta updates repetidos', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95', 42);
    await h.say('subí el pan flauta a 95', 42);
    expect(h.store.requests).toHaveLength(1);
  });

  it('5 pedidos cada 10 minutos por chat', async () => {
    const h = await harness();
    for (let i = 0; i < 6; i++) await h.say(`¿cuánto sale el café? ${i}`);
    expect(h.store.requests).toHaveLength(5);
    expect(h.last()).toMatch(/muchos pedidos/);
  });

  it('fotos sin texto y audios sin transcripción', async () => {
    const h = await harness();
    await h.worker.handle({ kind: 'other', chatId: CLIENT_CHAT, fromName: 'x' });
    expect(h.last()).toBe(copy.soloTexto());
    await h.worker.handle({ kind: 'voice', chatId: CLIENT_CHAT, fromName: 'x', download: async () => ({ data: Buffer.from(''), mime: 'audio/ogg' }) });
    expect(h.last()).toBe(copy.audioSinTranscripcion());
  });

  it('textos truncados a 2000 caracteres', async () => {
    const h = await harness();
    await h.say(`¿${'a'.repeat(3000)}?`);
    expect(lastReq(h).raw_text.length).toBe(2000);
  });

  it('el costo del pedido suma el uso del modelo', async () => {
    const base = createFakeProvider();
    const ai: AiProvider = {
      ...base,
      async interpret(i) {
        const r = await base.interpret(i);
        return { ...r, usage: { model: 'claude-sonnet-5-5', inputTokens: 1_000_000, outputTokens: 0 } };
      },
    };
    const h = await harness({ ai });
    await h.say('subí el pan flauta a 95');
    expect(lastReq(h).cost_usd).toBe(2);
  });
});

describe('fase 2: opciones para pedidos ambiguos', () => {
  it('dos vistas previas con un botón cada una; elegir publica esa', async () => {
    const h = await harness();
    await h.say('poné el fondo más oscuro');
    const req = lastReq(h);
    expect(req.status).toBe('esperando_cliente');
    const opts = h.channel.sent.filter((m) => m.buttons?.flat().some((b) => 'data' in b && b.data.startsWith('opt:')));
    expect(opts.map((m) => m.text.split('\n')[0])).toEqual(['Opción 1: Crema tostado', 'Opción 2: Gris piedra']);
    expect(h.store.versions.filter((v) => v.status === 'borrador')).toHaveLength(2);

    await h.say('sí');
    expect(h.last()).toMatch(/Elegí la que va/);

    await h.press(`opt:${req.short_id}:1`);
    const live = h.store.versions.find((v) => v.status === 'viva')!;
    expect((live.content as { theme: { background: string } }).theme.background).toBe('#E7E5E4');
    expect(h.store.versions.filter((v) => v.status === 'descartada')).toHaveLength(1);
    expect(h.store.requests[0]!.status).toBe('publicado');
    await h.press(`undo:${req.short_id}`);
    expect((h.store.versions.find((v) => v.status === 'viva')!.content as { theme: { background: string } }).theme.background).toBe('#FFF7ED');
  });
});
