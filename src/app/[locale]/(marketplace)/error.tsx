"use client";

import { AreaError } from "@/components/states/area-error";

export default function MarketplaceError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <AreaError {...props} />
    </div>
  );
}
