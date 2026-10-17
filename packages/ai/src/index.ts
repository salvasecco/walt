import type { DaleEnvValues } from '@dale/core';
import { createFakeProvider } from './fake.js';
import type { AiProvider } from './types.js';

export type { AiProvider, InterpretInput } from './types.js';
export { createFakeProvider, fakeInterpret, fakeAnswer, normalize, nextWeekdayEnd } from './fake.js';

/**
 * Returns the provider selected by `LLM_PROVIDER`.
 * TODO(01-worker): real `anthropic` and `bedrock` providers (structured output, 45 s timeout, one retry).
 */
export function createAi(env: Pick<DaleEnvValues, 'LLM_PROVIDER'> & Partial<DaleEnvValues>): AiProvider {
  switch (env.LLM_PROVIDER) {
    case 'fake':
      return createFakeProvider();
    case 'anthropic':
    case 'bedrock':
      throw new Error(`Proveedor ${env.LLM_PROVIDER} no implementado todavía (lo hace 01-worker). Usá LLM_PROVIDER=fake.`);
  }
}
