import { i18n, assertValidLocale } from "@/i18n-config";

export const metadata = {
  title: "i18n within app router - Vercel Examples",
  description: "How to do i18n in Next.js 16 within app router",
};

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default async function Root(props: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await props.params;
  assertValidLocale(lang);

  return (
    <html lang={lang}>
      <body>{props.children}</body>
    </html>
  );
}
