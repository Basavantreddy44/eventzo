import { z } from "zod";

const TIME = "([01]\\d|2[0-3]):[0-5]\\d";
const WINDOW_LINE = new RegExp(`^(${TIME})\\s*[-–]\\s*(${TIME})$`);

/** "06:45-08:15\n11:05-12:20" → [{start, end}]; null if any line is invalid or ends before it starts. */
export function parseWindows(text: string): { start: string; end: string }[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { start: string; end: string }[] = [];
  for (const line of lines) {
    const m = WINDOW_LINE.exec(line);
    if (!m) return null;
    const start = m[1];
    const end = m[3];
    if (end <= start) return null;
    out.push({ start, end });
  }
  return out.length <= 6 ? out : null;
}

export function formatWindows(windows: { start: string; end: string }[]): string {
  return windows.map((w) => `${w.start}-${w.end}`).join("\n");
}

function isRealDate(value: string): boolean {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Admin form for an auspicious date (enhancement B). Empty cityId = all cities. */
export const auspiciousDateFormSchema = z.object({
  id: z.uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
    .refine(isRealDate, "validation.date"),
  cityId: z.union([z.literal(""), z.uuid("validation.select")]),
  title: z.string().trim().min(3, "validation.titleLength").max(120, "validation.titleLength"),
  notes: z.string().trim().max(500, "validation.invalid"),
  significance: z.enum(["1", "2", "3"], "validation.select"),
  windows: z.string().refine((v) => parseWindows(v) !== null, "validation.windows"),
  source: z.string().trim().max(200, "validation.invalid"),
  isPublished: z.boolean(),
});

export type AuspiciousDateFormInput = z.infer<typeof auspiciousDateFormSchema>;

export function toAuspiciousDateRow(input: AuspiciousDateFormInput) {
  return {
    date: input.date,
    city_id: input.cityId || null,
    title: input.title,
    notes: input.notes || null,
    significance: Number(input.significance),
    muhurtham_windows: parseWindows(input.windows) ?? [],
    source: input.source || null,
    is_published: input.isPublished,
  };
}
