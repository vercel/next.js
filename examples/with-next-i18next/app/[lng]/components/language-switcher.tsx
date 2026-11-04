"use client";

import { usePathname, useRouter } from "next/navigation";
import { useT } from "next-i18next/client";

export function LanguageSwitcher({
  supportedLngs,
}: {
  supportedLngs: string[];
}) {
  const { t, i18n } = useT();
  const pathname = usePathname();
  const router = useRouter();

  const switchTo = (lng: string) => {
    const segments = pathname.split("/");
    segments[1] = lng;
    router.push(segments.join("/"));
  };

  return (
    <p>
      {t("switch_language")}{" "}
      {supportedLngs.map((lng) => (
        <button
          key={lng}
          type="button"
          disabled={lng === i18n.resolvedLanguage}
          onClick={() => switchTo(lng)}
        >
          {lng}
        </button>
      ))}
    </p>
  );
}
