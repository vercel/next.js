import { useEffect } from 'react'

import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'
import { useRouter } from 'next/router'
import { en, sv } from 'make-plural/plurals'
import LangSwitcher from '../components/LangSwitcher'

i18n.loadLocaleData('en', { plurals: en })
i18n.loadLocaleData('sv', { plurals: sv })

export default function Page({ Component, pageProps }) {
  const { locale } = useRouter()

  useEffect(() => {
    async function load(locale) {
      const { messages } = await import(`../locale/${locale}/messages.po`)

      i18n.load(locale, messages)
      i18n.activate(locale)
    }

    load(locale)
  }, [locale])

  return (
    <I18nProvider i18n={i18n}>
      <div>
        <LangSwitcher />
        <Component {...pageProps} />
      </div>
    </I18nProvider>
  )
}
