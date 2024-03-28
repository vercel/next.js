import { LanguageProvider } from "@inlang/paraglide-js-adapter-next";
import { languageTag } from "@/paraglide/runtime";
import { LanguageSwitcher } from "../lib/LanguageSwitcher";
import { Header } from "@/lib/Header";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <html lang={languageTag()}>
        <body>
          <Header>
            <LanguageSwitcher />
          </Header>

          {children}
        </body>
      </html>
    </LanguageProvider>
  );
}
