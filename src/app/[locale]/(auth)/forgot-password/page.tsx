import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "auth.forgot" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
