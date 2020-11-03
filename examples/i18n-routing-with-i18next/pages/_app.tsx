import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import '../styles/globals.css'

const resources = {
  en: {
    translation: require('../locales/en.json'),
  },
  de: {
    translation: require('../locales/de.json'),
  },
}

function MyApp({ Component, pageProps }: AppProps) {
  const { locale } = useRouter()
  i18n.use(initReactI18next).init({
    resources,
    lng: locale,
  })

  return (
    <I18nextProvider i18n={i18n}>
      <Component {...pageProps} />
    </I18nextProvider>
  )
}

export default MyApp
