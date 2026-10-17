import type { Interpretation, Inventory, QuoteDraft, QuoteSummary, Turn, Usage } from '@dale/core';

export interface InterpretInput {
  inventory: Inventory;
  history: Turn[];
  text: string;
  agencyName: string;
  clientName: string;
  /** ISO timestamp with offset; relative dates are resolved in America/Montevideo. */
  now: string;
}

export interface ConsultaInput {
  inventory: Inventory;
  text: string;
  /** e.g. "el asistente de Estudio Faro". Optional (SPEC §10 signature has only inventory and text). */
  assistantName?: string;
}

/** Model provider interface (SPEC §10). */
export interface AiProvider {
  readonly name: 'anthropic' | 'bedrock' | 'fake';
  interpret(input: InterpretInput): Promise<{ interpretation: Interpretation; usage: Usage }>;
  answerConsulta(input: ConsultaInput): Promise<{ answer: string; usage: Usage }>;
  draftQuote(input: { text: string; pastQuotes: QuoteSummary[] }): Promise<{ quote: QuoteDraft; usage: Usage }>;
  /** Optional: transcribe a voice note. Throws if not configured. */
  transcribe(audio: Buffer, mime: string): Promise<string>;
}
