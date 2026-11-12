import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage() {
  const t = await getTranslations("auth.login");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      {/* The form reads ?next= on the client, so it sits behind a boundary. */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
