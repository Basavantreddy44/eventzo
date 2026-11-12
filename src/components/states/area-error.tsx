"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "./error-state";

/** Shared body for every area's error.tsx (client boundary). */
export function AreaError({
  error,
  reset,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  const t = useTranslations();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title={t("errors.errorTitle")}
      description={t("errors.errorBody")}
      retryLabel={t("common.retry")}
      onRetry={reset}
      digest={error.digest}
    >
      <Button asChild variant="outline">
        <Link href={homeHref}>{t("common.goHome")}</Link>
      </Button>
    </ErrorState>
  );
}
