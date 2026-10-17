import type { DaleEnvValues } from '@dale/core';

/**
 * Minimal environment for the agent process (SPEC §11.2): only what the model
 * provider needs, plus PATH, an isolated HOME and TMPDIR. The SDK `env` option
 * REPLACES the subprocess environment, so nothing else from the worker leaks in
 * (no GITHUB_TOKEN, no Supabase keys, no Telegram token).
 */
export type AgentEnvSource = Pick<
  DaleEnvValues,
  'LLM_PROVIDER' | 'ANTHROPIC_API_KEY' | 'AWS_REGION' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY'
>;

export function buildAgentEnv(src: AgentEnvSource, opts: { home: string; path?: string }): Record<string, string> {
  const env: Record<string, string> = {
    PATH: opts.path ?? '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: opts.home,
    TMPDIR: opts.home,
    LANG: 'C.UTF-8',
    CLAUDE_AGENT_SDK_CLIENT_APP: 'dale-agent/0.1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
  if (src.LLM_PROVIDER === 'anthropic') {
    if (!src.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY para el agente');
    env.ANTHROPIC_API_KEY = src.ANTHROPIC_API_KEY;
  } else if (src.LLM_PROVIDER === 'bedrock') {
    if (!src.AWS_REGION || !src.AWS_ACCESS_KEY_ID || !src.AWS_SECRET_ACCESS_KEY) {
      throw new Error('Faltan AWS_REGION, AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY para el agente en Bedrock');
    }
    env.CLAUDE_CODE_USE_BEDROCK = '1';
    env.AWS_REGION = src.AWS_REGION;
    env.AWS_ACCESS_KEY_ID = src.AWS_ACCESS_KEY_ID;
    env.AWS_SECRET_ACCESS_KEY = src.AWS_SECRET_ACCESS_KEY;
  } else {
    throw new Error('El agente de código necesita LLM_PROVIDER=anthropic o bedrock (el proveedor falso no programa)');
  }
  return env;
}

/** Bedrock wants the `anthropic.` prefix; first-party ids go as they are. */
export function agentModelId(provider: DaleEnvValues['LLM_PROVIDER'], model: string): string {
  if (provider === 'bedrock' && !model.includes('anthropic.')) return `anthropic.${model}`;
  return model;
}
