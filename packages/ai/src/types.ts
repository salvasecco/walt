import type { Interpretation, Inventory, LabeledExample, QuoteDraft, QuoteSummary, Turn, Usage } from '@walt/core';

export interface InterpretInput {
  inventory: Inventory;
  history: Turn[];
  text: string;
  agencyName: string;
  clientName: string;
  /** ISO timestamp with offset; relative dates are resolved in America/Montevideo. */
  now: string;
  /** The agency's policy in natural language (`rules.policy_text`): data from the agency, criteria to classify. */
  policyText?: string;
  /** Requests the agency says are always "algo nuevo" (`rules.config.alwaysNew`). */
  alwaysNew?: string[];
  /** Requests of the same agency it relabeled, most similar first (`ExampleSource`). */
  examples?: LabeledExample[];
}

export interface QuoteInput {
  text: string;
  pastQuotes: QuoteSummary[];
  /** What the interpreter understood, and why it is "algo nuevo". */
  summary?: string;
  why?: string;
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
  draftQuote(input: QuoteInput): Promise<{ quote: QuoteDraft; usage: Usage }>;
  /** Optional: transcribe a voice note. Throws if not configured. */
  transcribe(audio: Buffer, mime: string): Promise<string>;
}
