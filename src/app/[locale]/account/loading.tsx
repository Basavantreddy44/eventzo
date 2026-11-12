import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/states/loading-state";

export default function AccountLoading() {
  return <LoadingState label={useTranslations("common")("loading")} cards={2} />;
}
