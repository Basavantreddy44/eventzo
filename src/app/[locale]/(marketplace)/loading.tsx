import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/states/loading-state";

export default function MarketplaceLoading() {
  const t = useTranslations("common");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <LoadingState label={t("loading")} />
    </div>
  );
}
