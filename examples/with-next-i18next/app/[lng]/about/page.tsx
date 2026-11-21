import Link from "next/link";
import { getT } from "next-i18next/server";
import { LanguageSwitcher } from "../components/language-switcher";
import i18nConfig from "../../../i18n.config";

export default async function About() {
  const { t, lng } = await getT();

  return (
    <main>
      <h1>{t("about_title")}</h1>
      <p>{t("about_text")}</p>
      <p>
        <Link href={`/${lng}`}>{t("back_home")}</Link>
      </p>
      <LanguageSwitcher supportedLngs={i18nConfig.supportedLngs} />
    </main>
  );
}
