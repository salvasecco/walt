import { normalizeCategory, type Category } from './types.ts';

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

/** A row of `similar_labeled_requests` (migration 0004), as the stores return it. */
interface LabeledRow {
  raw_text: string;
  from_category: string | null;
  to_category: string;
  reason: string | null;
}

/** What the worker's stores implement (infra): the RPC rows, most similar first. */
interface LabeledRowSource {
  similarLabeledRequests(factoryId: string, text: string, k?: number): Promise<LabeledRow[]>;
}

/** A stored relabel as a prompt example; null if the row has no text or an unknown category. */
export function exampleFromLabeledRow(row: LabeledRow): LabeledExample | null {
  const category = normalizeCategory(row.to_category);
  if (!category || !row.raw_text) return null;
  return { text: row.raw_text, category, previous: normalizeCategory(row.from_category), reason: row.reason };
}

/**
 * The store as an `ExampleSource`: its own `similarExamples` if it has one, else its
 * `similarLabeledRequests` (the 0004 RPC rows) mapped to examples; the empty source otherwise.
 */
export function exampleSourceOf(store: unknown): ExampleSource {
  const s = store as Partial<ExampleSource & LabeledRowSource> | null;
  if (s && typeof s.similarExamples === 'function') return s as ExampleSource;
  if (s && typeof s.similarLabeledRequests === 'function') {
    const rows = s as LabeledRowSource;
    return {
      async similarExamples(q) {
        const found = await rows.similarLabeledRequests(q.factoryId, q.text, q.limit);
        return found.map(exampleFromLabeledRow).filter((e): e is LabeledExample => e !== null);
      },
    };
  }
  return emptyExampleSource;
}

/** How many examples go to the prompt, at most. */
export const MAX_PROMPT_EXAMPLES = 8;
