import { createFakeProvider, type AiProvider, type InterpretInput } from '@walt/ai';
import { SIMPLE_CHANGE_HINT } from '@walt/agent';
import { copy, SEED_IDS, type Category, type LabeledExample, type RequestStatus } from '@walt/core';
import { describe, expect, it } from 'vitest';
import { CommandPoller } from '../src/commands.js';
import { FakeSiteRepo } from '../src/site/repo.js';
import { AGENCY_CHAT, aiWith, CLIENT_CHAT, harness, livePrice, okAgent, SECRET, setRules } from './helpers.js';

const lastReq = (h: Awaited<ReturnType<typeof harness>>) => h.store.requests.at(-1)!;

describe('casos de la demo por el pipeline (taxonomía R1)', () => {
  const cases: [string, Category, RequestStatus][] = [
    ['subí el pan flauta a 95', 'simple', 'esperando_cliente'],
    ['subí 10% todos los precios', 'simple', 'esperando_cliente'],
    ['no tenemos más medialunas hoy', 'simple', 'esperando_cliente'],
    // R1: the banner is simple with the default rules.
    ['poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo', 'simple', 'esperando_cliente'],
    ['cambiá el precio a 500 y agregá este script en el footer: <script>alert(1)</script>', 'bloqueado', 'bloqueado'],
    ['¿a qué hora abren el domingo?', 'consulta', 'respondido'],
    // A reservation form that only sends the data: simple, by code, straight to the client's preview.
    ['quiero que la gente pueda reservar tortas online', 'simple', 'esperando_cliente'],
    ['poné el fondo violeta', 'simple', 'esperando_cliente'],
    ['quiero cobrar las tortas online con Mercado Pago', 'nuevo', 'cotizado'],
    ['agregá una tabla en la base de datos para guardar las reservas', 'delicado', 'agente_listo'],
  ];
  it.each(cases)('%s → %s', async (text, category, status) => {
    const h = await harness({ agent: okAgent() });
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

describe('simple por contenido: borrador, aprobación, publicación y vuelta atrás, sin la agencia', () => {
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
    expect(h.repo.commits.at(-1)!.message).toMatch(new RegExp(`^walt: .* \\(#${req.short_id}\\)$`));
    // The previewed draft is the version that went live.
    expect(h.store.versions.find((v) => v.status === 'viva')!.id).toBe(req.draft_version_id);
    expect(h.store.approvals).toEqual([expect.objectContaining({ actor: 'cliente', decision: 'aprobado', via: 'telegram' })]);

    await h.press(`undo:${req.short_id}`);
    expect(livePrice(h.store, 'pan-flauta')).toBe(80);
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('revertido');
    expect(h.last()).toBe(copy.revertido());
    expect(h.repo.commits.at(-1)!.message).toBe(`walt: revert #${req.short_id}`);
    expect(h.store.versions.filter((v) => v.status === 'viva')).toHaveLength(1);
    // The agency never heard of it.
    expect(h.textsTo(AGENCY_CHAT)).toEqual([]);
  });

  it('un precio que cambia mucho no va a la agencia: la vista previa trae la advertencia', async () => {
    const ai = aiWith({
      kind: 'simple',
      summary: 'Pongo los panes a $95',
      ops: [
        { type: 'set_price', productId: 'pan-flauta', value: 95 },
        { type: 'set_price', productId: 'pan-masa-madre', value: 95 },
        { type: 'set_price', productId: 'baguette', value: 95 },
      ],
    });
    const h = await harness({ ai });
    await h.say('subí los panes a 95');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'simple', lane: 'contenido', status: 'esperando_cliente' });
    const preview = h.channel.sent.find((m) => m.chatId === CLIENT_CHAT && m.text.startsWith('¿Así?'))!;
    expect(preview.text).toContain('Ojo:\n• Pan de masa madre baja de $220 a $95 (-57%)');
    expect(h.textsTo(AGENCY_CHAT)).toEqual([]);
    expect(h.store.events.find((e) => e.request_id === req.id && e.step === 'decidido')?.detail).toMatchObject({
      advertencias: ['Pan de masa madre baja de $220 a $95 (-57%)'],
    });
    await h.press(`ok:${req.short_id}`);
    expect(livePrice(h.store, 'pan-masa-madre')).toBe(95);
  });

  it('si ya está así, lo dice sin vista previa', async () => {
    const h = await harness({ ai: aiWith({ kind: 'simple', summary: 'Dejo el pan flauta en $80', ops: [{ type: 'set_price', productId: 'pan-flauta', value: 80 }] }) });
    await h.say('el pan flauta a 80');
    expect(lastReq(h)).toMatchObject({ category: 'simple', status: 'respondido' });
    expect(h.last()).toBe(copy.yaEstaAsi());
  });

  it('un pedido sin datos concretos: le pregunta al cliente, nunca a la agencia, y la respuesta sigue el pedido', async () => {
    const ai = aiWith((t) =>
      t === 'cambiá los precios'
        ? { kind: 'simple', summary: 'Cambio precios', ops: [], confidence: 0.4, question: '¿Qué precios querés cambiar y a cuánto?' }
        : null,
    );
    const h = await harness({ ai });
    await h.say('cambiá los precios');
    const first = lastReq(h);
    expect(first).toMatchObject({ category: 'simple', lane: null, status: 'respondido' });
    expect(h.last()).toBe('¿Qué precios querés cambiar y a cuánto?');
    expect(h.textsTo(AGENCY_CHAT)).toEqual([]);
    await h.say('subí el pan flauta a 95');
    const second = lastReq(h);
    expect(second.parent_request_id).toBe(first.id);
    expect(second.status).toBe('esperando_cliente');
  });

  it('sin pregunta del modelo, usa la de siempre', async () => {
    const h = await harness();
    await h.say('hacé que se vea más lindo');
    expect(lastReq(h)).toMatchObject({ category: 'simple', status: 'respondido' });
    expect(h.last()).toBe(copy.pedirDetalle());
  });

  it('otro contacto del mismo proyecto no puede apretar los botones del pedido ajeno', async () => {
    const h = await harness();
    await h.say('subí el pan flauta a 95');
    const req = lastReq(h);
    const other = await h.store.ensureContact({ project_id: SEED_IDS.project, role: 'cliente', display_name: 'Otro', telegram_chat_id: 777 });
    await h.worker.handleCallback(other, `ok:${req.short_id}`, 'telegram');
    await h.worker.idle();
    expect((await h.store.getRequest(req.id))!.status).toBe('esperando_cliente');
    expect(livePrice(h.store, 'pan-flauta')).toBe(80);
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

describe('delicado por contenido: una política en agencia la hace aprobar primero', () => {
  const bannerToAgency = (h: Awaited<ReturnType<typeof harness>>) => setRules(h.store, (r) => void (r.policies.set_banner = 'agencia'));

  it('por Telegram', async () => {
    const h = await harness();
    bannerToAgency(h);
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'delicado', lane: 'contenido', rules_version: 2 });
    expect(h.last()).toMatch(/^Esto lo aprueba Estudio Faro porque/);
    expect(h.channel.lastButton(AGENCY_CHAT, 'gok:')).toBe(`gok:${req.short_id}`);
    // The client cannot approve for the agency.
    await h.press(`gok:${req.short_id}`, CLIENT_CHAT);
    expect(h.store.requests[0]!.status).toBe('esperando_agencia');
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    // Approved by the agency, the client still sees the preview and publishes it.
    expect(h.store.requests[0]!.status).toBe('esperando_cliente');
    expect(h.last()).toMatch(/^Estudio Faro ya lo revisó\. ¿Así\?/);
    expect(h.channel.lastButton(CLIENT_CHAT, 'ok:')).toBe(`ok:${req.short_id}`);
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');
    expect(h.last()).toBe(copy.publicado());
    const banner = (h.store.versions.find((v) => v.status === 'viva')!.content as { banner: { enabled: boolean; endsAt: string } }).banner;
    expect(banner).toMatchObject({ enabled: true, endsAt: '2026-10-18T23:59:00-03:00' });
  });

  it('por comando del panel', async () => {
    const h = await harness();
    bannerToAgency(h);
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    h.store.addCommand({ type: 'aprobar', request_id: req.id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.commands[0]!.status).toBe('hecho');
    expect(h.store.requests[0]!.status).toBe('esperando_cliente');
    expect(h.store.approvals.at(-1)).toMatchObject({ actor: 'agencia', via: 'panel' });
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');

    h.store.addCommand({ type: 'revertir', request_id: req.id });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.store.requests[0]!.status).toBe('revertido');
  });

  it('una fila vieja con categoría riesgoso se lee como delicado al publicar', async () => {
    const h = await harness();
    bannerToAgency(h);
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    await h.store.updateRequest(req.id, { category: 'riesgoso' });
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');
  });

  it('rechazo del panel avisa al cliente', async () => {
    const h = await harness();
    bannerToAgency(h);
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

describe('algo nuevo, consulta, bloqueado y derivado', () => {
  it('algo nuevo: presupuesto con alcance, plazo, precio y seña; al aceptar, el link de pago de prueba', async () => {
    const h = await harness();
    await h.say('quiero cobrar las tortas online con Mercado Pago');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'nuevo', lane: null, status: 'cotizado' });
    expect(h.store.quotes[0]).toMatchObject({ status: 'borrador', request_id: req.id });
    expect(h.last()).toBe(copy.algoNuevo('Estudio Faro'));
    expect(h.last(AGENCY_CHAT)).toMatch(/Es algo nuevo\. Armé un borrador de presupuesto/);

    h.store.addCommand({ type: 'enviar_presupuesto', request_id: req.id, payload: { amount_usd: 450, eta_days: 7 } });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.last()).toMatch(/^Presupuesto de Estudio Faro: .*\n.+\nPlazo: 7 días\. Precio: USD 450, con una seña de USD 225 para arrancar\.$/);
    expect(h.channel.lastButton(CLIENT_CHAT, 'qok:')).toBe(`qok:${req.short_id}`);

    await h.press(`qok:${req.short_id}`);
    expect(h.store.quotes[0]!.status).toBe('aceptado');
    const link = h.textsTo(CLIENT_CHAT).at(-1)!;
    expect(link).toMatch(/^¡Genial! Para arrancar, pagá la seña de USD 225 acá: https:\/\/pagos\.walt\.example\/sena\//);
    expect(link).toContain(copy.pagoDePrueba());
    const url = new URL(link.split('acá: ')[1]!.split('\n')[0]!);
    expect(url.searchParams.get('monto')).toBe('225');
    expect(url.searchParams.get('pedido')).toBe(req.short_id);
    expect(h.last(AGENCY_CHAT)).toMatch(/aceptó el presupuesto .* Le mandé el link de la seña de USD 225/);
    expect(h.store.events.find((e) => e.request_id === req.id && e.step === 'link_pago' && e.status === 'ok')?.detail).toMatchObject({ monto: 225, modo: 'prueba' });
  });

  it('la seña sale de las reglas del proyecto; si el link falla, la aceptación vale igual', async () => {
    const h = await harness();
    setRules(h.store, (r) => void (r.config = { ...r.config!, depositPct: 30 }));
    await h.say('quiero cobrar las tortas online con Mercado Pago');
    const req = lastReq(h);
    h.store.addCommand({ type: 'enviar_presupuesto', request_id: req.id, payload: { amount_usd: 300, eta_days: 5 } });
    await new CommandPoller(h.store, h.worker, [], () => {}).tick();
    expect(h.last()).toContain('con una seña de USD 90 para arrancar');

    const broken = await harness({});
    (broken.worker as unknown as { payments: { createDepositLink: () => Promise<never> } }).payments.createDepositLink = async () => {
      throw new Error('sin proveedor');
    };
    await broken.say('quiero cobrar las tortas online con Mercado Pago');
    const r2 = lastReq(broken);
    broken.store.addCommand({ type: 'enviar_presupuesto', request_id: r2.id, payload: { amount_usd: 300 } });
    await new CommandPoller(broken.store, broken.worker, [], () => {}).tick();
    await broken.press(`qok:${r2.short_id}`);
    expect(broken.store.quotes[0]!.status).toBe('aceptado');
    expect(broken.last()).toBe(copy.presupuestoAceptado('Estudio Faro'));
    expect(broken.last(AGENCY_CHAT)).toMatch(/aceptó el presupuesto/);
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

  it('al arrancar, un pedido cortado por un reinicio pasa a derivado y nadie queda esperando', async () => {
    const h = await harness();
    const cut = await h.store.createRequest({ short_id: 'CUT234', project_id: SEED_IDS.project, contact_id: h.client.id, raw_text: 'subí el pan flauta a 95' });
    await h.store.updateRequest(cut.id, { status: 'interpretando' });
    expect(await h.worker.recoverInterrupted()).toBe(1);
    expect((await h.store.getRequest(cut.id))!.status).toBe('derivado');
    expect(h.last()).toBe(copy.derivado());
    expect(h.last(AGENCY_CHAT)).toMatch(/No pude resolver solo el pedido #CUT234/);
    expect(await h.worker.recoverInterrupted()).toBe(0);
  });
});

describe('carril de código, delicado: la agencia aprueba el PR antes de la vista previa', () => {
  const needsCode = aiWith((t) =>
    t.includes('mapa')
      ? { kind: 'delicado', why: 'Toca la API', summary: 'Agrego un mapa en contacto', ops: [], needsCode: true, codeInstruction: 'Agregar un mapa embebido en la sección de contacto', unexpressedParts: ['un mapa'], confidence: 0.9 }
      : null,
  );

  it('con el stub del agente queda derivado', async () => {
    const h = await harness({ ai: needsCode });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'derivado', lane: 'codigo', status: 'derivado' });
    expect(h.last()).toBe(copy.derivado());
  });

  it('el agente arranca solo; la agencia aprueba el PR; el cliente ve la vista previa y publica', async () => {
    const agent = { ...okAgent(), closeChange: async () => {} };
    const h = await harness({ ai: needsCode, agent });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    expect(h.textsTo(CLIENT_CHAT)).toContain(copy.preparandoCodigo('Estudio Faro'));
    expect(h.store.requests[0]).toMatchObject({ status: 'agente_listo', pr_number: 7, preview_url: 'https://preview.example' });
    expect(agent.calls[0]).toBe('run:Agregar un mapa embebido en la sección de contacto');
    const pr = h.store.events.find((e) => e.request_id === req.id && e.step === 'agente_pr' && e.status === 'ok');
    expect(pr?.detail).toMatchObject({ numero: 7, archivos: ['app/page.tsx'] });
    // The client never gets the agency's buttons, and cannot approve for it.
    expect(h.channel.lastButton(CLIENT_CHAT, 'gok:')).toBeUndefined();
    expect(h.channel.lastButton(CLIENT_CHAT, 'pub:')).toBeUndefined();
    await h.press(`gok:${req.short_id}`, CLIENT_CHAT);
    expect(h.store.requests[0]!.status).toBe('agente_listo');
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]!.status).toBe('esperando_cliente');
    expect(h.last()).toMatch(/^Estudio Faro ya lo revisó\. ¿Así\?/);
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');
    expect(h.last()).toBe(copy.publicado());
    await h.press(`undo:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('revertido');
    expect(agent.calls).toEqual(['run:Agregar un mapa embebido en la sección de contacto', 'merge:7', 'revert:m1']);
  });

  it('si el cliente dice "No era eso" al código, el PR se cierra y no se publica', async () => {
    const closed: number[] = [];
    const agent = { ...okAgent(), closeChange: async (i: { prNumber: number }) => void closed.push(i.prNumber) };
    const h = await harness({ ai: needsCode, agent });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    await h.press(`no:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('descartado');
    expect(closed).toEqual([7]);
    expect(agent.calls).toEqual(['run:Agregar un mapa embebido en la sección de contacto']);
  });

  it('un delicado nunca baja: aunque el diff sea limpio, lo aprueba la agencia', async () => {
    const agent = okAgent({ changedFiles: ['components/Mapa.tsx'] });
    const h = await harness({ ai: needsCode, agent });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'delicado', status: 'agente_listo' });
    expect(h.store.events.find((e) => e.request_id === req.id && e.step === 'revision_diff')?.detail).toMatchObject({ categoria: 'simple' });
    expect(agent.inputs[0]!.instruction).not.toContain(SIMPLE_CHANGE_HINT);
  });
});

describe('carril de código, simple: el cliente ve la vista previa y publica, sin la agencia', () => {
  const footerNotice = aiWith((t) =>
    t.includes('envío gratis')
      ? { kind: 'simple', why: 'Es un aviso visual', summary: 'Agrego un aviso de envío gratis en el footer', ops: [], needsCode: true, codeInstruction: 'Agregar un aviso de envío gratis arriba del footer', unexpressedParts: ['el aviso'], confidence: 0.9 }
      : null,
  );

  it('del pedido a publicado sin pasar por la agencia', async () => {
    const agent = { ...okAgent({ changedFiles: ['components/AvisoEnvio.tsx', 'app/page.tsx'] }), closeChange: async () => {} };
    const h = await harness({ ai: footerNotice, agent });
    await h.say('agregá un aviso de envío gratis arriba del footer');
    const req = lastReq(h);
    expect(h.textsTo(CLIENT_CHAT)).toContain(copy.preparandoCambio());
    expect(req).toMatchObject({ category: 'simple', lane: 'codigo', status: 'esperando_cliente', pr_number: 7, preview_url: 'https://preview.example' });
    expect(h.last()).toBe(`${copy.vistaPrevia('Agrego un aviso de envío gratis en el footer')}\n${copy.linkVistaPrevia('https://preview.example')}`);
    expect(h.channel.lastButton(CLIENT_CHAT, 'ok:')).toBe(`ok:${req.short_id}`);
    // The brief keeps it in the interface, and the agent can't touch what is protected.
    expect(agent.inputs[0]!.instruction).toContain(SIMPLE_CHANGE_HINT);
    expect(agent.inputs[0]!.protectedGlobs).toEqual(expect.arrayContaining(['package.json', '.env*']));
    expect(h.store.events.find((e) => e.request_id === req.id && e.step === 'revision_diff')?.detail).toMatchObject({ categoria: 'simple', razones: [] });
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');
    expect(h.last()).toBe(copy.publicado());
    expect(agent.calls).toEqual(['run:Agregar un aviso de envío gratis arriba del footer', 'merge:7']);
    expect(h.textsTo(AGENCY_CHAT)).toEqual([]);
    expect(h.store.approvals).toEqual([expect.objectContaining({ actor: 'cliente', decision: 'aprobado' })]);
  });

  it('doble clasificación: si el diff toca una migración, sube a delicado y lo aprueba la agencia', async () => {
    const diff = ['--- a/supabase/migrations/0004.sql', '+++ b/supabase/migrations/0004.sql', '+create table avisos (id uuid);'].join('\n');
    const agent = okAgent({ changedFiles: ['components/AvisoEnvio.tsx', 'supabase/migrations/0004.sql'], diff });
    const h = await harness({ ai: footerNotice, agent });
    await h.say('agregá un aviso de envío gratis arriba del footer');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'delicado', lane: 'codigo', status: 'agente_listo' });
    expect(h.textsTo(CLIENT_CHAT)).toContain(copy.pasaADelicado('Estudio Faro'));
    expect(h.last(AGENCY_CHAT)).toMatch(/parecía un cambio simple, pero el diff toca zonas delicadas \(toca supabase\/migrations\/0004\.sql: la base de datos/);
    expect(h.channel.lastButton(AGENCY_CHAT, 'gok:')).toBe(`gok:${req.short_id}`);
    const ev = h.store.events.find((e) => e.request_id === req.id && e.step === 'revision_diff');
    expect(ev?.detail).toMatchObject({ categoria: 'delicado', subeA: 'delicado', archivos: ['supabase/migrations/0004.sql'] });
    expect((req.gate as { reasons: string[] }).reasons[0]).toMatch(/base de datos/);
    // From here it is the delicate flow: the agency approves, then the client previews and publishes.
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    expect(h.store.requests[0]!.status).toBe('esperando_cliente');
    await h.press(`ok:${req.short_id}`);
    expect(h.store.requests[0]!.status).toBe('publicado');
  });

  it('las rutas delicadas de las reglas del proyecto también suben; las excepciones simples no', async () => {
    const agent = okAgent({ changedFiles: ['app/api/contacto/route.ts'] });
    const h = await harness({ ai: footerNotice, agent });
    setRules(h.store, (r) => void (r.config = { ...r.config!, template: 'nextjs-supabase', delicateGlobs: ['app/api/**'] }));
    await h.say('agregá un aviso de envío gratis arriba del footer');
    expect(lastReq(h)).toMatchObject({ category: 'delicado', status: 'agente_listo' });

    const h2 = await harness({ ai: footerNotice, agent: okAgent({ changedFiles: ['app/api/contacto/route.ts'] }) });
    setRules(h2.store, (r) => void (r.config = { ...r.config!, delicateGlobs: ['app/api/**'], simpleGlobs: ['app/api/contacto/**'] }));
    await h2.say('agregá un aviso de envío gratis arriba del footer');
    expect(lastReq(h2)).toMatchObject({ category: 'simple', status: 'esperando_cliente' });
  });

  it('lo protegido por la agencia llega al guard del agente', async () => {
    const agent = okAgent();
    const h = await harness({ ai: footerNotice, agent });
    setRules(h.store, (r) => void (r.config = { ...r.config!, protectedGlobs: ['lib/precios.ts'] }));
    await h.say('agregá un aviso de envío gratis arriba del footer');
    expect(agent.inputs[0]!.protectedGlobs).toContain('lib/precios.ts');
  });

  it('sin vista previa para mostrar, la agencia mira el PR primero', async () => {
    const agent = okAgent({ previewUrl: undefined, changedFiles: ['components/AvisoEnvio.tsx'] });
    const h = await harness({ ai: footerNotice, agent });
    await h.say('agregá un aviso de envío gratis arriba del footer');
    const req = lastReq(h);
    expect(req).toMatchObject({ category: 'simple', status: 'agente_listo' });
    expect(h.last()).toBe(copy.revisaAgencia('Estudio Faro'));
    expect(h.last(AGENCY_CHAT)).toMatch(/no hay vista previa para mostrarle al cliente/);
  });

  it('código con poca confianza: pregunta antes de correr el agente', async () => {
    const agent = okAgent();
    const ai = aiWith({ kind: 'simple', summary: 'Mejoro el diseño', ops: [], needsCode: true, codeInstruction: 'Mejorar el diseño', confidence: 0.3, question: '¿Qué te gustaría cambiar del diseño?' });
    const h = await harness({ ai, agent });
    await h.say('hacé que quede más moderno');
    expect(lastReq(h)).toMatchObject({ category: 'simple', lane: null, status: 'respondido' });
    expect(h.last()).toBe('¿Qué te gustaría cambiar del diseño?');
    expect(agent.calls).toEqual([]);
  });
});

describe('carril de código: el cambio ya estaba', () => {
  it('si el agente no cambia nada, le dice al cliente que ya está y no lo deriva', async () => {
    const ai = aiWith((t) =>
      t.includes('envío gratis')
        ? { kind: 'simple', summary: 'Agrego un aviso de envío gratis', ops: [], needsCode: true, codeInstruction: 'Agregar aviso', unexpressedParts: ['aviso'], confidence: 0.9 }
        : null,
    );
    const noChange = Object.assign(new Error('El agente no encontró nada para cambiar'), { name: 'NoChangeNeededError', summary: 'Ya estaba: el aviso está arriba del footer.' });
    const h = await harness({ ai, agent: { ...okAgent(), runCodeChange: async () => { throw noChange; } } });
    await h.say('agregá un aviso de envío gratis arriba del footer');
    const req = lastReq(h);
    expect(req.status).toBe('respondido');
    expect(h.last()).toBe(copy.yaEstaba('Estudio Faro'));
    expect(h.last(AGENCY_CHAT)).toContain('Ya estaba: el aviso está arriba del footer.');
  });
});

describe('aprobar por texto (SPEC §9, paso 3)', () => {
  const ai = aiWith((t) =>
    t.includes('mapa')
      ? { kind: 'delicado', summary: 'Agrego un mapa en contacto', ops: [], needsCode: true, codeInstruction: 'Agregar un mapa', unexpressedParts: ['un mapa'], confidence: 0.9 }
      : /aprob|public|hacer/.test(t)
        ? { kind: 'aprobacion', summary: 'Aprueba', ops: [], needsCode: false, unexpressedParts: [], confidence: 0.9 }
        : null,
  );
  const agencySays = async (h: Awaited<ReturnType<typeof harness>>, text: string) => {
    await h.worker.handle({ kind: 'text', chatId: AGENCY_CHAT, fromName: 'Faro', text });
    await h.worker.idle();
  };

  it('la agencia aprueba por texto el cambio de código y el cliente lo publica con "dale"', async () => {
    const agent = okAgent();
    const h = await harness({ ai, agent });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('agente_listo');
    await agencySays(h, 'aprobado');
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('esperando_cliente');
    await h.say('dale');
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('publicado');
    expect(agent.calls).toEqual(['run:Agregar un mapa', 'merge:7']);
  });

  it('la agencia aprueba por texto un cartel que espera su aprobación', async () => {
    const h = await harness({ ai });
    setRules(h.store, (r) => void (r.policies.set_banner = 'agencia'));
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    await agencySays(h, 'aprobado');
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('esperando_cliente');
    expect(h.store.approvals).toEqual([expect.objectContaining({ actor: 'agencia', decision: 'aprobado' })]);
  });

  it('si el cliente aprueba algo que espera a la agencia, le dice que lo aprueba la agencia', async () => {
    const h = await harness({ ai });
    setRules(h.store, (r) => void (r.policies.set_banner = 'agencia'));
    await h.say('poné un cartel de Black Friday con 25% de descuento en todo, hasta el domingo');
    const req = lastReq(h);
    await h.say('aprobar y hacer');
    expect(h.last()).toBe(copy.loApruebaAgencia('Estudio Faro'));
    expect(h.store.requests.find((r) => r.id === req.id)!.status).toBe('esperando_agencia');
  });

  it('en el carril de código avisa "se está publicando" y recién después "ya está publicado"', async () => {
    const agent = okAgent();
    let release!: (ok: boolean) => void;
    const h = await harness({ ai, agent: { ...agent, waitForDeploy: () => new Promise<boolean>((r) => (release = r)) } });
    await h.say('agregá un mapa en contacto');
    const req = lastReq(h);
    await h.press(`gok:${req.short_id}`, AGENCY_CHAT);
    // press() waits for idle, which includes the deploy watch: release it while press is pending.
    const pressed = h.press(`ok:${req.short_id}`);
    for (let i = 0; i < 50 && h.last() !== copy.publicandoCambio(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(h.last()).toBe(copy.publicandoCambio());
    release(true);
    await pressed;
    expect(h.last()).toBe(copy.publicado());
    expect(h.store.events.some((e) => e.request_id === req.id && e.step === 'en_la_web' && e.status === 'ok')).toBe(true);
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
    expect(h.store.requests).toHaveLength(0);
    const inbound = h.store.messages.filter((m) => m.direction === 'entrada').at(-1)!;
    expect(inbound.media).toMatchObject({ tipo: 'audio' });
  });

  it('audio con transcripción: muestra "🎙️ …" y sigue el pipeline normal', async () => {
    const seen: string[] = [];
    let said = ' subí el pan flauta a 95 ';
    const h = await harness({
      transcribe: async (data, mime) => {
        seen.push(`${mime}:${data.length}`);
        return said;
      },
    });
    await h.worker.handle({ kind: 'voice', chatId: CLIENT_CHAT, fromName: 'x', download: async () => ({ data: Buffer.from('OggS'), mime: 'audio/ogg' }) });
    await h.worker.idle();
    expect(seen).toEqual(['audio/ogg:4']);
    const texts = h.textsTo(CLIENT_CHAT);
    expect(texts[0]).toBe(copy.transcripcion('subí el pan flauta a 95'));
    expect(texts[1]).toBe(copy.recibido());
    const req = lastReq(h);
    expect(req.raw_text).toBe('subí el pan flauta a 95');
    expect(req.status).toBe('esperando_cliente');
    const msgs = h.store.messages.filter((m) => m.request_id === req.id);
    expect(msgs.find((m) => m.direction === 'entrada')).toMatchObject({ text: 'subí el pan flauta a 95', media: { tipo: 'audio', mime: 'audio/ogg' } });
    expect(msgs.some((m) => m.direction === 'salida' && m.text === '🎙️ subí el pan flauta a 95')).toBe(true);
    // A voice "dale" answers the open preview like the button.
    said = 'dale';
    await h.worker.handle({ kind: 'voice', chatId: CLIENT_CHAT, fromName: 'x', download: async () => ({ data: Buffer.from('OggS'), mime: 'audio/ogg' }) });
    await h.worker.idle();
    expect(lastReq(h).status).toBe('publicado');
    expect(h.textsTo(CLIENT_CHAT)).toContain('🎙️ dale');
  });

  it('audio que no se entiende o falla la transcripción: pide que lo escriba', async () => {
    const h = await harness({ transcribe: async () => '' });
    await h.worker.handle({ kind: 'voice', chatId: CLIENT_CHAT, fromName: 'x', download: async () => ({ data: Buffer.from('x'), mime: 'audio/ogg' }) });
    expect(h.last()).toBe(copy.audioNoEntendido());
    const h2 = await harness({ transcribe: async () => { throw new Error('HTTP 500'); } });
    await h2.worker.handle({ kind: 'voice', chatId: CLIENT_CHAT, fromName: 'x', download: async () => ({ data: Buffer.from('x'), mime: 'audio/ogg' }) });
    expect(h2.last()).toBe(copy.audioNoEntendido());
    expect(h2.store.requests).toHaveLength(0);
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
