import useTranslation from "next-translate/useTranslation";
import "./style.css";

export const metadata = {
  title: "Next.js",
};

export default function RootLayout({ children }) {
  const { lang } = useTranslation();

  return (
    <html lang={lang}>
      <head />
      <body className="container">{children}</body>
    </html>
  );
}
