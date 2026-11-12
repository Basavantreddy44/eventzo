"use client";

import { AreaError } from "@/components/states/area-error";

export default function ReceiptError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AreaError {...props} homeHref="/account" />;
}
