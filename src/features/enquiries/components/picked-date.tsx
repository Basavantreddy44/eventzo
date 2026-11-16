"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Hands a date picked on the listing calendar to the enquiry form on the same
 * page (Roadmap C2). Picks are delivered as events, so the form reacts in a
 * callback instead of syncing state in an effect.
 */
type Listener = (date: string) => void;
type PickedDate = { pick: (date: string) => void; subscribe: (listener: Listener) => () => void };

const PickedDateContext = createContext<PickedDate>({ pick: () => {}, subscribe: () => () => {} });

export function PickedDateProvider({ children }: { children: ReactNode }) {
  const [value] = useState<PickedDate>(() => {
    const listeners = new Set<Listener>();
    return {
      pick: (date) => listeners.forEach((l) => l(date)),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  });
  return <PickedDateContext.Provider value={value}>{children}</PickedDateContext.Provider>;
}

export function usePickedDate() {
  return useContext(PickedDateContext);
}
