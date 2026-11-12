"use client";

import { AreaError } from "@/components/states/area-error";

export default function AccountError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AreaError {...props} homeHref="/account" />;
}
