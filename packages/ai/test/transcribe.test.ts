import { describe, expect, it } from 'vitest';
import { audioExtension, createTranscriber, transcribeWithOpenAi, TRANSCRIBE_FALLBACK_MODEL, TRANSCRIBE_MODEL } from '../src/index.js';

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: FormData[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    calls.push(init.body as FormData);
    const r = responses[calls.length - 1] ?? responses.at(-1)!;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('transcribe (OpenAI)', () => {
  it('usa el modelo nuevo en español', async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { text: ' subí el pan flauta a 95 ' } }]);
    const text = await transcribeWithOpenAi('k', Buffer.from('OggS'), 'audio/ogg', { fetch: f });
    expect(text).toBe('subí el pan flauta a 95');
    expect(calls[0]!.get('model')).toBe(TRANSCRIBE_MODEL);
    expect(calls[0]!.getAll('languages[]')).toEqual(['es']);
    expect((calls[0]!.get('file') as File).name).toBe('audio.ogg');
  });

  it('si el modelo nuevo rechaza el pedido, reintenta con el anterior', async () => {
    const { f, calls } = fakeFetch([{ status: 400 }, { status: 200, body: { text: 'hola' } }]);
    expect(await transcribeWithOpenAi('k', Buffer.from('x'), 'audio/ogg', { fetch: f })).toBe('hola');
    expect(calls[1]!.get('model')).toBe(TRANSCRIBE_FALLBACK_MODEL);
    expect(calls[1]!.get('language')).toBe('es');
  });

  it('una clave inválida no reintenta y no muestra la clave', async () => {
    const { f, calls } = fakeFetch([{ status: 401 }]);
    await expect(transcribeWithOpenAi('sk-secreta', Buffer.from('x'), 'audio/ogg', { fetch: f })).rejects.toThrow(/HTTP 401/);
    expect(calls).toHaveLength(1);
  });

  it('sin clave no hay transcriptor', () => {
    expect(createTranscriber({})).toBeNull();
    expect(createTranscriber({ OPENAI_API_KEY: 'k' })).toBeTypeOf('function');
    expect(audioExtension('audio/mp4')).toBe('m4a');
  });
});
