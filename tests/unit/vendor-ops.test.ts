import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/auth/paths";
import {
  amountInWordsINR,
  fiscalYear,
  fiscalYearRange,
  netCash,
  paiseToPlain,
  percent,
  presetRange,
  resolveRange,
  toCsv,
} from "@/features/finance/lib/finance";
import { expenseSchema, payoutSchema, toExpenseRow } from "@/features/finance/schemas";
import { availableJobActions, groupByDate, isToday, telHref, zonedDate, zonedTime } from "@/features/staff/lib/jobs";
import { assignSchema, jobResponseSchema, staffSchema, toStaffRow } from "@/features/staff/schemas";
import { resourceSchema, toResourceRow } from "@/features/vendor/schemas";
import { NOTIFICATION_KINDS } from "@/features/notifications/lib/templates";
import en from "../../messages/en.json";

const UUID = "3f1c2b7e-9a4d-4c1e-8f2a-1b2c3d4e5f60";

describe("staff roster schema", () => {
  const base = { fullName: "Ravi Kumar", phone: "", skill: "", branchId: "", memberId: "", dayRate: "", notes: "" };

  it("accepts a roster entry without login, phone or rate", () => {
    expect(toStaffRow(staffSchema.parse(base))).toEqual({
      full_name: "Ravi Kumar",
      phone: null,
      skill: null,
      branch_id: null,
      member_id: null,
      day_rate_paise: null,
      notes: null,
    });
  });

  it("normalises the phone and stores the day rate in paise", () => {
    const row = toStaffRow(staffSchema.parse({ ...base, phone: "98450 12345", dayRate: "1,500.50" }));
    expect(row.phone).toBe("+919845012345");
    expect(row.day_rate_paise).toBe(150050);
  });

  it("rejects a blank name, a bad phone and a rate over ₹10 lakh", () => {
    expect(staffSchema.safeParse({ ...base, fullName: " " }).success).toBe(false);
    expect(staffSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
    expect(staffSchema.safeParse({ ...base, dayRate: "1000001" }).success).toBe(false);
    expect(staffSchema.safeParse({ ...base, memberId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("assignment schema", () => {
  const base = {
    jobId: "",
    bookingItemId: UUID,
    reservationId: "",
    staffProfileId: UUID,
    roleLabel: "",
    callDate: "",
    callTime: "",
    pay: "",
  };

  it("needs a job, a booking or an offline booking", () => {
    expect(assignSchema.safeParse(base).success).toBe(true);
    expect(assignSchema.safeParse({ ...base, bookingItemId: "" }).success).toBe(false);
  });

  it("needs a staff member", () => {
    expect(assignSchema.safeParse({ ...base, staffProfileId: "" }).success).toBe(false);
  });

  it("takes the call time as a date and time together", () => {
    expect(assignSchema.safeParse({ ...base, callDate: "2027-01-15", callTime: "08:30" }).success).toBe(true);
    const half = assignSchema.safeParse({ ...base, callDate: "2027-01-15" });
    expect(half.success).toBe(false);
    expect(half.error?.issues[0]?.message).toBe("staff.callTimeBoth");
    expect(assignSchema.safeParse({ ...base, callDate: "2027-01-15", callTime: "25:00" }).success).toBe(false);
  });

  it("only knows the four staff answers", () => {
    expect(jobResponseSchema.safeParse({ assignmentId: UUID, action: "check_in", note: "" }).success).toBe(true);
    expect(jobResponseSchema.safeParse({ assignmentId: UUID, action: "cancel", note: "" }).success).toBe(false);
  });
});

describe("staff app actions (mirror respond_job)", () => {
  const start = "2027-01-15T04:30:00Z"; // 10:00 IST
  const at = (iso: string) => new Date(iso);

  it("offers accept and decline weeks before", () => {
    expect(
      availableJobActions({ status: "assigned", startsAt: start, cancelled: false }, at("2026-12-20T00:00:00Z")),
    ).toEqual(["accept", "decline"]);
  });

  it("opens check-in a day before the start", () => {
    const dayBefore = at("2027-01-14T05:00:00Z");
    expect(availableJobActions({ status: "accepted", startsAt: start, cancelled: false }, dayBefore)).toEqual([
      "check_in",
      "decline",
    ]);
    expect(availableJobActions({ status: "assigned", startsAt: start, cancelled: false }, dayBefore)).toContain(
      "check_in",
    );
  });

  it("allows completing only once the job has started", () => {
    expect(
      availableJobActions({ status: "checked_in", startsAt: start, cancelled: false }, at("2027-01-15T04:00:00Z")),
    ).toEqual([]);
    expect(
      availableJobActions({ status: "checked_in", startsAt: start, cancelled: false }, at("2027-01-15T06:00:00Z")),
    ).toEqual(["complete"]);
  });

  it("offers nothing on closed or cancelled jobs", () => {
    for (const status of ["completed", "declined", "cancelled"]) {
      expect(availableJobActions({ status, startsAt: start, cancelled: false })).toEqual([]);
    }
    expect(availableJobActions({ status: "assigned", startsAt: start, cancelled: true })).toEqual([]);
  });
});

describe("job dates in IST", () => {
  it("formats the IST calendar date and wall-clock time", () => {
    expect(zonedDate("2027-01-14T19:00:00Z")).toBe("2027-01-15"); // 00:30 IST next day
    expect(zonedTime("2027-01-15T04:30:00Z")).toBe("10:00");
  });

  it("groups jobs by IST date in order", () => {
    const groups = groupByDate(
      [{ s: "2027-01-15T04:30:00Z" }, { s: "2027-01-15T12:00:00Z" }, { s: "2027-01-15T19:00:00Z" }],
      (r) => r.s,
    );
    expect(groups.map((g) => [g.date, g.rows.length])).toEqual([
      ["2027-01-15", 2],
      ["2027-01-16", 1],
    ]);
  });

  it("treats a job overlapping today as today's job", () => {
    const now = new Date("2027-01-15T06:00:00Z");
    expect(isToday("2027-01-14T14:00:00Z", "2027-01-15T02:00:00Z", now)).toBe(true); // overnight
    expect(isToday("2027-01-16T04:30:00Z", "2027-01-16T10:00:00Z", now)).toBe(false);
    // ends exactly at IST midnight: belongs to the previous day only
    expect(isToday("2027-01-14T04:30:00Z", "2027-01-14T18:30:00Z", now)).toBe(false);
  });

  it("builds a clean tel: link", () => {
    expect(telHref("+91 98450-12345")).toBe("tel:+919845012345");
  });
});

describe("financial year & ranges", () => {
  it("splits the Indian financial year on 1 April", () => {
    expect(fiscalYear("2027-03-31")).toBe("2026-27");
    expect(fiscalYear("2027-04-01")).toBe("2027-28");
    expect(fiscalYear("2099-12-01")).toBe("2099-00");
    expect(fiscalYearRange("2026-11-12")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("computes the presets", () => {
    expect(presetRange("this_month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("last_month", "2027-01-05")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("last_90", "2026-11-12")).toEqual({ from: "2026-08-15", to: "2026-11-12" });
    expect(presetRange("last_fy", "2026-11-12")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });

  it("accepts a valid custom range and falls back otherwise", () => {
    expect(resolveRange({ from: "2026-01-01", to: "2026-06-30" }, "2026-11-12")).toEqual({
      from: "2026-01-01",
      to: "2026-06-30",
      preset: "custom",
    });
    expect(resolveRange({ from: "2026-06-30", to: "2026-01-01" }, "2026-11-12").preset).toBe("this_month");
    expect(resolveRange({ from: "2020-01-01", to: "2026-01-01" }, "2026-11-12").preset).toBe("this_month");
    expect(resolveRange({ range: "this_fy" }, "2026-11-12")).toMatchObject({ from: "2026-04-01", preset: "this_fy" });
    expect(resolveRange({ range: "bogus" }, "2026-11-12", "this_fy").preset).toBe("this_fy");
  });
});

describe("money helpers", () => {
  it("computes net cash and shares", () => {
    expect(netCash({ received_paise: 1000, refunded_paise: 200, expenses_paise: 900 })).toBe(-100);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBeNull();
  });

  it("writes plain rupees for spreadsheets", () => {
    expect(paiseToPlain(12500050)).toBe("125000.50");
    expect(paiseToPlain(2500000)).toBe("25000");
    expect(paiseToPlain(-150)).toBe("-1.50");
  });

  it("writes amounts in words the Indian way", () => {
    expect(amountInWordsINR(0)).toBe("Rupees Zero Only");
    expect(amountInWordsINR(2500000)).toBe("Rupees Twenty-Five Thousand Only");
    expect(amountInWordsINR(12500050)).toBe("Rupees One Lakh Twenty-Five Thousand and Paise Fifty Only");
    expect(amountInWordsINR(1_000_000_000)).toBe("Rupees One Crore Only");
    expect(amountInWordsINR(123_456_789_00)).toBe(
      "Rupees Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Only",
    );
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "x\ny", 5, null]])).toBe('"a,b","say ""hi""","x\ny",5,\r\n');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1", "-2", "@x", "ok"]])).toBe("'=HYPERLINK(1),'+1,'-2,'@x,ok\r\n");
  });
});

describe("expense schemas", () => {
  const base = {
    category: "materials" as const,
    amount: "2,500",
    spentOn: "2026-11-12",
    payee: " KR Market ",
    mode: "upi" as const,
    reference: "",
    note: "",
    branchId: "",
    bookingItemId: "",
    idempotencyKey: "expense-key-0001",
  };

  it("converts rupees to paise and blanks to null", () => {
    expect(toExpenseRow(expenseSchema.parse(base))).toEqual({
      category: "materials",
      amount_paise: 250000,
      spent_on: "2026-11-12",
      payee: "KR Market",
      mode: "upi",
      reference: null,
      note: null,
      branch_id: null,
      booking_item_id: null,
    });
  });

  it("rejects zero, negative and unknown categories", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, amount: "-5" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, category: "bribes" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...base, spentOn: "12/11/2026" }).success).toBe(false);
  });

  it("needs a payment mode for a staff payout", () => {
    const payout = {
      assignmentId: UUID,
      amount: "1500",
      spentOn: "2026-11-12",
      reference: "",
      idempotencyKey: "payout-0001",
    };
    expect(payoutSchema.safeParse({ ...payout, mode: "cash" }).success).toBe(true);
    expect(payoutSchema.safeParse({ ...payout, mode: "" }).success).toBe(false);
  });
});

describe("resources linked to staff", () => {
  const base = {
    name: "Meena",
    kind: "artist" as const,
    allocationMode: "exclusive" as const,
    capacity: "1",
    serviceId: "",
    branchId: "",
    setupBufferMin: "0",
    breakdownBufferMin: "0",
    travelBufferMin: "0",
  };

  it("links an artist resource to a staff member", () => {
    expect(toResourceRow(resourceSchema.parse({ ...base, staffProfileId: UUID })).staff_profile_id).toBe(UUID);
    expect(toResourceRow(resourceSchema.parse(base)).staff_profile_id).toBeNull();
  });

  it("refuses a staff link on a hall", () => {
    expect(resourceSchema.safeParse({ ...base, kind: "venue_space", staffProfileId: UUID }).success).toBe(false);
  });
});

describe("routes & notifications", () => {
  it("protects receipts", () => {
    expect(isProtectedPath("/receipts/abc")).toBe(true);
  });

  it("has a message and a WhatsApp template for every job notification", () => {
    for (const kind of ["job.assigned", "job.cancelled", "job.declined"] as const) {
      expect(NOTIFICATION_KINDS[kind].whatsapp.name).toMatch(/^eventzo_job_/);
      const [group, name] = kind.split(".");
      expect((en.notifications.kinds as Record<string, Record<string, string>>)[group][name]).toBeTruthy();
    }
  });
});
