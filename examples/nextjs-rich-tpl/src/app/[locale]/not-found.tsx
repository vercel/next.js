import { useTranslations } from "next-intl";

import type { Metadata } from "next";
import NotFound from "@/components/pages/not-found";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFoundPage() {
  const t = useTranslations("PageNotFound");
  return <NotFound title={t("title")} />;
}
