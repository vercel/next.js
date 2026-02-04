import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import Code from "../components/Code";
import PageLayout from "../components/PageLayout";

export default function Index() {
  const t = useTranslations("Index");
  const { locale } = useRouter();

  return (
    <PageLayout title={t("title")}>
      <p>
        {t("description", {
          locale,
          code: (children) => <Code>{children}</Code>,
        })}
      </p>
    </PageLayout>
  );
}

export function getStaticProps({ locale }) {
  return {
    props: {
      messages: {
        ...require(`../messages/shared/${locale}.json`),
        ...require(`../messages/index/${locale}.json`),
      },
    },
  };
}
