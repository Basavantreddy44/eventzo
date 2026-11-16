export type StepState = "done" | "due" | "overdue" | "upcoming";
export type PaymentStep = { key: "booked" | "advance" | "balance" | "event"; state: StepState; amount: number | null };

/**
 * C8 payment timeline. Dates are YYYY-MM-DD in India time; `today` likewise.
 * Advance = what confirms the booking; balance = the rest, due on balance_due_on.
 */
export function paymentSteps(
  item: {
    status: string;
    total_paise: number;
    advance_paise: number;
    paid_paise: number;
    balance_due_on: string;
    event_date: string;
  },
  today: string,
): PaymentStep[] {
  const closed = item.status === "cancelled" || item.status === "expired";
  const advancePaid = item.paid_paise >= item.advance_paise || item.status === "confirmed";
  const balance = Math.max(item.total_paise - item.advance_paise, 0);
  const fullyPaid = item.paid_paise >= item.total_paise;

  const advance: StepState = advancePaid ? "done" : closed ? "upcoming" : "due";
  let balanceState: StepState = "upcoming";
  if (fullyPaid) balanceState = "done";
  else if (!closed && advancePaid) balanceState = item.balance_due_on < today ? "overdue" : "due";

  return [
    { key: "booked", state: "done", amount: null },
    { key: "advance", state: advance, amount: item.advance_paise },
    ...(balance > 0
      ? [{ key: "balance" as const, state: balanceState, amount: item.total_paise - item.advance_paise }]
      : []),
    { key: "event", state: !closed && item.event_date < today ? "done" : "upcoming", amount: null },
  ];
}
