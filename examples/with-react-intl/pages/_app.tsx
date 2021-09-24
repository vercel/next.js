import type { AppProps } from 'next/app'
import { IntlProvider } from 'react-intl'
import { useRouter } from 'next/router'

export default function MyApp({ Component, pageProps }: AppProps) {
  const { locale, defaultLocale } = useRouter()
  return (
    <IntlProvider
      locale={locale}
      defaultLocale={defaultLocale}
      messages={pageProps.intlMessages}
    >
      <Component {...pageProps} />
    </IntlProvider>
  )
}
