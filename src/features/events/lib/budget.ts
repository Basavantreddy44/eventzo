/**
 * Event budget (enhancement F): planned amounts per category (entered by the
 * hosts) next to what is booked and paid with vendors on Eventzo. Pure, so the
 * same maths runs in tests and on the page.
 */

export type BudgetLine = {
  id: string;
  business_category_id: string | null;
  label: string | null;
  planned_paise: number;
};

export type EventVendorMoney = {
  business_category_id: string | null;
  booking_status: string | null;
  total_paise: number | null;
  paid_paise: number | null;
  refunded_paise: number | null;
};

export type BudgetRow = {
  key: string;
  lineId: string | null;
  categoryId: string | null;
  label: string | null;
  plannedPaise: number;
  bookedPaise: number;
  paidPaise: number;
};

export type BudgetSummary = {
  rows: BudgetRow[];
  plannedPaise: number;
  bookedPaise: number;
  paidPaise: number;
  /** planned − booked; negative means over budget. */
  remainingPaise: number;
};

const LIVE = new Set(["pending_payment", "confirmed"]);

export function eventBudget(lines: BudgetLine[], vendors: EventVendorMoney[]): BudgetSummary {
  const rows = new Map<string, BudgetRow>();
  for (const l of lines) {
    const key = l.business_category_id ?? `label:${l.id}`;
    rows.set(key, {
      key,
      lineId: l.id,
      categoryId: l.business_category_id,
      label: l.label,
      plannedPaise: Number(l.planned_paise),
      bookedPaise: 0,
      paidPaise: 0,
    });
  }
  for (const v of vendors) {
    if (!v.booking_status || !v.business_category_id) continue;
    const key = v.business_category_id;
    const row =
      rows.get(key) ??
      ({ key, lineId: null, categoryId: key, label: null, plannedPaise: 0, bookedPaise: 0, paidPaise: 0 } as BudgetRow);
    if (LIVE.has(v.booking_status)) row.bookedPaise += Number(v.total_paise ?? 0);
    // Money kept after a cancellation is still money spent.
    row.paidPaise += Math.max(0, Number(v.paid_paise ?? 0) - Number(v.refunded_paise ?? 0));
    rows.set(key, row);
  }
  const list = [...rows.values()];
  const sum = (f: (r: BudgetRow) => number) => list.reduce((s, r) => s + f(r), 0);
  const plannedPaise = sum((r) => r.plannedPaise);
  const bookedPaise = sum((r) => r.bookedPaise);
  return {
    rows: list,
    plannedPaise,
    bookedPaise,
    paidPaise: sum((r) => r.paidPaise),
    remainingPaise: plannedPaise - bookedPaise,
  };
}

/** A planned amount from an estimator range: the midpoint, rounded to whole rupees. */
export function plannedFromRange(lowPaise: number, highPaise: number): number {
  return Math.round((lowPaise + highPaise) / 2 / 100) * 100;
}
