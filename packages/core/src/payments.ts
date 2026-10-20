/**
 * Payment links for the deposit of an accepted quote ("algo nuevo", brief §1). R1 has no Stripe or
 * Mercado Pago account yet: the fake provider builds a test link with the amount and charges nothing.
 * Real providers (Stripe, Mercado Pago, Pix) implement the same interface in R2.
 */

export const PAYMENT_MODES = ['prueba', 'real'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface DepositLinkInput {
  quoteId: string;
  /** Short id of the request, for the reference shown to the client. */
  shortId: string;
  title: string;
  /** Deposit to charge, in USD. */
  amountUsd: number;
}

export interface PaymentLink {
  url: string;
  amountUsd: number;
  provider: string;
  mode: PaymentMode;
}

export interface PaymentLinks {
  readonly provider: string;
  readonly mode: PaymentMode;
  createDepositLink(input: DepositLinkInput): Promise<PaymentLink>;
}

/** Deposit asked by default when the rules don't say: half of the quote. */
export const DEFAULT_DEPOSIT_PCT = 50;

/** Deposit in whole USD (at least 1 when the quote is not free). */
export function depositAmount(totalUsd: number, pct: number = DEFAULT_DEPOSIT_PCT): number {
  if (!(totalUsd > 0) || !(pct > 0)) return 0;
  return Math.max(1, Math.round((totalUsd * Math.min(pct, 100)) / 100));
}

/** Host of the test links: `.example` is reserved, so nobody can mistake it for a real checkout. */
export const TEST_PAYMENTS_BASE = 'https://pagos.walt.example';

/** Test mode: a link with the amount that charges nothing. */
export function createFakePaymentLinks(base: string = TEST_PAYMENTS_BASE): PaymentLinks {
  return {
    provider: 'prueba',
    mode: 'prueba',
    async createDepositLink({ quoteId, shortId, amountUsd }) {
      const url = new URL(`/sena/${encodeURIComponent(quoteId)}`, base);
      url.searchParams.set('pedido', shortId);
      url.searchParams.set('monto', String(amountUsd));
      url.searchParams.set('moneda', 'USD');
      url.searchParams.set('modo', 'prueba');
      return { url: url.toString(), amountUsd, provider: 'prueba', mode: 'prueba' };
    },
  };
}
