import type { Category } from './types.ts';

/**
 * Relabeled requests of the same agency as examples for the decision prompt (brief §2). The store
 * implements `ExampleSource` (default retrieval: `pg_trgm` similarity in Postgres, see the contract);
 * until it does, the worker uses `emptyExampleSource`.
 */
export interface LabeledExample {
  /** The client's text, as the request was received. */
  text: string;
  /** The category the agency says it is. */
  category: Category;
  /** What Walt had decided, if the agency changed it. */
  previous?: Category | null;
  /** The agency's reason, optional. */
  reason?: string | null;
}

export interface ExampleQuery {
  /** Only this agency's examples: the data of one agency never feeds another. */
  factoryId: string;
  projectId?: string;
  /** The new request's text, to rank by similarity. */
  text: string;
  limit: number;
}

export interface ExampleSource {
  similarExamples(query: ExampleQuery): Promise<LabeledExample[]>;
}

export const emptyExampleSource: ExampleSource = {
  async similarExamples() {
    return [];
  },
};

/** The store as an `ExampleSource` when it implements it; the empty source otherwise. */
export function exampleSourceOf(store: unknown): ExampleSource {
  const s = store as Partial<ExampleSource> | null;
  return s && typeof s.similarExamples === 'function' ? (s as ExampleSource) : emptyExampleSource;
}

/** How many examples go to the prompt, at most. */
export const MAX_PROMPT_EXAMPLES = 8;
