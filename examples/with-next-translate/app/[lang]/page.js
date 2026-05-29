import Link from "next/link";
import Trans from "next-translate/Trans";
import useTranslation from "next-translate/useTranslation";

export default function Home() {
  const { t, lang } = useTranslation();
  const isRTL = lang === "ar" || lang === "he";
  const arrow = isRTL ? String.fromCharCode(8592) : String.fromCharCode(8594);

  return (
    <main dir={isRTL ? "rtl" : "ltr"}>
      <Trans
        i18nKey="home:title"
        components={[
          <h1 className="title" />,
          <a href="https://nextjs.org">Next.js!</a>,
        ]}
      />

      <p className="description">
        {t("home:description")} <code>_pages/index.js</code>
      </p>

      <div className="grid">
        <Link href="/en">
          <div className="card">
            <h3>{t("home:english")}</h3>
            <p>
              {t("home:change-to")} {t("home:english")}
            </p>
          </div>
        </Link>

        <Link href="/ca">
          <div className="card">
            <h3>{t("home:catalan")}</h3>
            <p>
              {t("home:change-to")} {t("home:catalan")}
            </p>
          </div>
        </Link>

        <Link href="/ar">
          <div className="card">
            <h3>{t("home:arabic")}</h3>
            <p>
              {t("home:change-to")} {t("home:arabic")}
            </p>
          </div>
        </Link>

        <Link href="/he">
          <div className="card">
            <h3>{t("home:hebrew")}</h3>
            <p>
              {t("home:change-to")} {t("home:hebrew")}
            </p>
          </div>
        </Link>

        <a href="https://nextjs.org/docs" className="card">
          <h3>Next.{`js ${arrow}`}</h3>
          <p>{t("home:next-docs")}</p>
        </a>

        <a href="https://github.com/vinissimus/next-translate" className="card">
          <h3>{`Learn ${arrow}`}</h3>
          <p>{t("home:plugin-docs")}</p>
        </a>
      </div>
    </main>
  );
}
