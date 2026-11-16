/**
 * Large-text mode (Roadmap C12): a per-device choice kept in localStorage and
 * applied as <html data-text="large"> before first paint (see TEXT_SIZE_SCRIPT),
 * which scales every rem-based size up.
 */
export const TEXT_SIZE_KEY = "ez-text";

/** Inline <head> script: applies the saved choice before the page paints. */
export const TEXT_SIZE_SCRIPT = `try{if(localStorage.getItem("${TEXT_SIZE_KEY}")==="large")document.documentElement.dataset.text="large"}catch(e){}`;

export function isLargeText(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.text === "large";
}

export function setLargeText(on: boolean) {
  if (on) document.documentElement.dataset.text = "large";
  else delete document.documentElement.dataset.text;
  try {
    if (on) localStorage.setItem(TEXT_SIZE_KEY, "large");
    else localStorage.removeItem(TEXT_SIZE_KEY);
  } catch {
    // Private mode / blocked storage: the change still applies to this page.
  }
}
