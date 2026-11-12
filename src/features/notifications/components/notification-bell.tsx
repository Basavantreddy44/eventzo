"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Header bell with the unread count. New notifications arrive live through
 * Supabase Realtime (RLS limits the stream to the user's own rows); opening
 * the list refreshes the count from the server.
 */
export function NotificationBell({
  userId,
  initialCount,
  label,
}: {
  userId: string;
  initialCount: number;
  label: string;
}) {
  const [extra, setExtra] = useState(0);
  const [base, setBase] = useState(initialCount);
  if (base !== initialCount) {
    // Server sent a fresh count (navigation / refresh): reset the live delta.
    setBase(initialCount);
    setExtra(0);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => setExtra((n) => n + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const count = base + extra;
  return (
    <Link
      href="/account/notifications"
      className="hover:bg-accent relative inline-flex size-9 items-center justify-center rounded-md"
      aria-label={count > 0 ? `${label} (${count})` : label}
      data-testid="notification-bell"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span
          className={cn(
            "bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
          )}
          data-testid="notification-count"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
