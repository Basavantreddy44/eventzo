import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/states/loading-state";

export default function AdminLoading() {
  return <LoadingState label={useTranslations("common")("loading")} />;
}
