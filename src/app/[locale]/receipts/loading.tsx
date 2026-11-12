import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/states/loading-state";

export default function ReceiptLoading() {
  return <LoadingState label={useTranslations("common")("loading")} cards={1} />;
}
