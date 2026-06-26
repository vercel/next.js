import Link from "next/link";
import Head from "next/head";
import Title from "../../components/title";
import useI18n from "../../hooks/use-i18n";
import { languages, contentLanguageMap } from "../../lib/i18n";

const HomePage = () => {
  const i18n = useI18n();

  return (
    <div>
      <Head>
        <meta
          httpEquiv="content-language"
          content={contentLanguageMap[i18n.activeLocale]}
        />
      </Head>
      <Title username="Peter" />
      <h2>{i18n.t("intro.text")}</h2>
      <h3>{i18n.t("intro.description")}</h3>
      <div>Current locale: {i18n.activeLocale}</div>
      <Link href="/[lng]" as="/de">
        Use client-side routing to change language to 'de'
      </Link>
    </div>
  );
};

export async function getStaticProps({ params }) {
  const { default: lngDict = {} } = await import(
    `../../locales/${params.lng}.json`
  );

  return {
    props: { lng: params.lng, lngDict },
  };
}

export async function getStaticPaths() {
  return {
    paths: languages.map((l) => ({ params: { lng: l } })),
    fallback: false,
  };
}

export default HomePage;
