"use client";

import { useSyncExternalStore } from "react";

/**
 * Shortlist (Roadmap C4): up to 4 listing slugs kept in this browser, so it
 * works before signing in. Sharing goes through a /compare?l=… link that
 * anyone can open, so nothing needs to be stored on the server.
 */
import { SHORTLIST_MAX, SHORTLIST_SLUG as SLUG } from "./constants";

export { SHORTLIST_MAX };
const KEY = "eventzo.shortlist.v1";
const EVENT = "eventzo:shortlist";
const EMPTY: string[] = [];

let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.value; // storage blocked (private mode): keep what we have in memory
  }
  if (raw === cache.raw) return cache.value;
  let value: string[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed))
      value = parsed.filter((s): s is string => typeof s === "string" && SLUG.test(s)).slice(0, SHORTLIST_MAX);
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

function write(next: string[]) {
  const value = next.slice(0, SHORTLIST_MAX);
  const raw = JSON.stringify(value);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // storage blocked: keep it for this tab only
  }
  cache = { raw, value };
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useShortlist() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items,
    has: (slug: string) => items.includes(slug),
    full: items.length >= SHORTLIST_MAX,
    /** Adds or removes; returns false when the list is full. */
    toggle(slug: string): boolean {
      const current = read();
      if (current.includes(slug)) {
        write(current.filter((s) => s !== slug));
        return true;
      }
      if (current.length >= SHORTLIST_MAX) return false;
      write([...current, slug]);
      return true;
    },
    clear: () => write([]),
  };
}

/** /compare?l=a,b,c for these slugs. */
export function compareHref(slugs: string[]) {
  return { pathname: "/compare", query: { l: slugs.join(",") } } as const;
}
