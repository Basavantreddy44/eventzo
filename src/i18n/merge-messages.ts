export type Messages = { [key: string]: string | Messages };

/** Deep-merge `override` onto `base`; used to fall back to English per key. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    if (typeof value === "string") {
      if (value.trim() !== "") out[key] = value;
    } else if (value && typeof value === "object") {
      out[key] = mergeMessages(typeof current === "object" ? current : {}, value);
    }
  }
  return out;
}
