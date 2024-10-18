"use client";

import { useTranslations } from "next-intl";

export default function Error({ error, reset }: { error: any; reset: any }) {
  const t = useTranslations("PageError");
  console.log(error);

  return (
    <div className="flex justify-center items-center w-full h-full min-h-[calc(100dvh-64px)]">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <button onClick={reset}>{t("retry")}</button>
      </div>
    </div>
  );
}
