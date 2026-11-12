import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/auth/session";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.reset");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <ResetGate />
      </Suspense>
    </AuthCard>
  );
}

/** The reset link signs the user in (recovery session); without it, ask for a new link. */
async function ResetGate() {
  const t = await getTranslations();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-destructive text-sm">
          {t("auth.errors.sessionMissing")}
        </p>
        <Button asChild>
          <Link href="/forgot-password">{t("auth.forgot.submit")}</Link>
        </Button>
      </div>
    );
  }
  return <ResetPasswordForm />;
}
