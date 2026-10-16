import Link from "next/link";
import { Trans } from "react-i18next/TransWithoutContext";
import { getT } from "next-i18next/server";
import { Counter } from "./components/counter";
import { LanguageSwitcher } from "./components/language-switcher";
import i18nConfig from "../../i18n.config";

export default async function Home() {
  const { t, i18n, lng } = await getT();

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>
        <Trans t={t} i18n={i18n} i18nKey="intro">
          This page is a <strong>Server Component</strong>. Its text is
          translated on the server with getT.
        </Trans>
      </p>
      <Counter />
      <p>
        <Link href={`/${lng}/about`}>{t("about_link")}</Link>
      </p>
      <LanguageSwitcher supportedLngs={i18nConfig.supportedLngs} />
    </main>
  );
}
