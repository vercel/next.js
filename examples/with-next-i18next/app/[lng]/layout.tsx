import { dir } from "i18next";
import { I18nProvider } from "next-i18next/client";
import { getT, getResources, generateI18nStaticParams } from "@/i18n.server";

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
