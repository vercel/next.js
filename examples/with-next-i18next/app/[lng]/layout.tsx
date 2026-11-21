import { dir } from "i18next";
import {
  initServerI18next,
  getT,
  getResources,
  generateI18nStaticParams,
} from "next-i18next/server";
import { I18nProvider } from "next-i18next/client";
import i18nConfig from "../../i18n.config";

initServerI18next(i18nConfig);

export async function generateStaticParams() {
  return generateI18nStaticParams();
}

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("title") };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lng]">) {
  const { lng } = await params;
  const { i18n } = await getT();
  // Only ship the current and the fallback language to the client.
  const resources = getResources(i18n, undefined, [lng, "en"]);

  return (
    <html lang={lng} dir={dir(lng)}>
      <body>
        <I18nProvider language={lng} resources={resources}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
