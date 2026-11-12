import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export async function NoPermission({ title }: { title: string }) {
  const t = await getTranslations("admin.dashboard");
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <Card>
        <CardContent data-testid="no-permission">{t("noPermission")}</CardContent>
      </Card>
    </div>
  );
}
