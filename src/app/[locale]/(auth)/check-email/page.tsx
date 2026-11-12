import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/components/auth-card";
import { localeFrom } from "@/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/check-email">): Promise<Metadata> {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "auth.checkEmail" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckEmailPage({ searchParams }: PageProps<"/[locale]/check-email">) {
  const t = await getTranslations("auth.checkEmail");

  return (
    <AuthCard title={t("title")}>
      <div className="grid gap-5">
        <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <Suspense fallback={<p className="text-muted-foreground text-sm">{t("body")}</p>}>
          <Body searchParams={searchParams} />
        </Suspense>
        <Button asChild variant="outline">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </div>
    </AuthCard>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/[locale]/check-email">["searchParams"] }) {
  const t = await getTranslations("auth.checkEmail");
  const { mode } = await searchParams;
  return <p className="text-muted-foreground text-sm">{mode === "signup" ? t("signupBody") : t("body")}</p>;
}
