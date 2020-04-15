import React from 'react'
import I18n from '../lib/i18n'

export default function MyApp({ Component, pageProps, store }) {
  return (
    <I18n>
      <Component {...pageProps} />
    </I18n>
  )
}
