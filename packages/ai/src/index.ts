import type { DaleEnvValues } from '@dale/core';
import { anthropicTransport, bedrockTransport, createClaudeProvider } from './claude.js';
import { createFakeProvider } from './fake.js';
import type { AiProvider } from './types.js';

export type { AiProvider, InterpretInput, ConsultaInput } from './types.js';
export { createFakeProvider, fakeInterpret, fakeAnswer, normalize, nextWeekdayEnd } from './fake.js';
export {
  AiOutputError,
  anthropicTransport,
  bedrockModelId,
  bedrockTransport,
  buildInterpretUser,
  createClaudeProvider,
  INTERPRET_TIMEOUT_MS,
  sumUsage,
  transcribeWithOpenAi,
  untrusted,
  type ModelRequest,
  type ModelResponse,
  type ModelTransport,
} from './claude.js';
export { formatHistory, formatInventory, loadPrompt } from './prompts.js';

type AiEnv = Pick<DaleEnvValues, 'LLM_PROVIDER'> & Partial<DaleEnvValues>;

/** Returns the provider selected by `LLM_PROVIDER` (SPEC §10). Never logs credentials. */
export function createAi(env: AiEnv): AiProvider {
  const model = env.MODEL_INTERPRET ?? 'claude-sonnet-5-5';
  switch (env.LLM_PROVIDER) {
    case 'fake':
      return createFakeProvider();
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY para LLM_PROVIDER=anthropic');
      return createClaudeProvider({
        name: 'anthropic',
        transport: anthropicTransport({ apiKey: env.ANTHROPIC_API_KEY, model }),
        openAiKey: env.OPENAI_API_KEY,
      });
    }
    case 'bedrock': {
      if (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('Faltan AWS_REGION, AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY para LLM_PROVIDER=bedrock');
      }
      return createClaudeProvider({
        name: 'bedrock',
        transport: bedrockTransport({
          region: env.AWS_REGION,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          model,
        }),
        openAiKey: env.OPENAI_API_KEY,
      });
    }
  }
}
