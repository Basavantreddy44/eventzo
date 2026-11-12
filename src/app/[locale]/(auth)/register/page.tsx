import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/register">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("title") };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");

  return (
    <AuthCard title={t("title")} description={t("subtitle")}>
      <RegisterForm />
    </AuthCard>
  );
}
