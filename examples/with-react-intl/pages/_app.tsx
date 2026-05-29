import type { AppProps } from "next/app";
import type { MessageConfig } from "../helper/loadIntlMessages";
import { IntlProvider } from "react-intl";
import { useRouter } from "next/router";

export default function MyApp({
  Component,
  pageProps,
}: AppProps<{ intlMessages: MessageConfig }>) {
  const { locale, defaultLocale } = useRouter();
  return (
    <IntlProvider
      locale={locale as string}
      defaultLocale={defaultLocale}
      messages={pageProps.intlMessages}
    >
      <Component {...pageProps} />
    </IntlProvider>
  );
}
