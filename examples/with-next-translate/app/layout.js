import useTranslation from "next-translate/useTranslation";
import i18n from "../i18n.json";
import { redirect } from "next/navigation";
import "./style.css";

export const metadata = {
  title: "Next.js",
};

export default function RootLayout({ children }) {
  const { lang } = useTranslation("common");

  // Redirect to default locale if lang is not supported. /second-page -> /en/second-page
  if (!i18n.locales.includes(lang)) redirect(`/${i18n.defaultLocale}/${lang}`);

  return (
    <html lang={lang}>
      <head />
      <body className="container">
        {children}
      </body>
    </html>
  );
}
