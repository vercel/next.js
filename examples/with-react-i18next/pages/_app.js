import React from 'react'
import App, { Container } from 'next/app'
import { I18n as I18nR, I18nextProvider } from 'react-i18next'
import initialI18nInstance from '../i18n'

export default class MyApp extends App {
  render () {
    const { Component, pageProps } = this.props
    const { i18n, initialI18nStore, initialLanguage } = pageProps || {}

    return (
      <Container>
        <I18nextProvider
          i18n={i18n || initialI18nInstance}
          initialI18nStore={initialI18nStore}
          initialLanguage={initialLanguage}
        >
          <React.Fragment>
            <I18nR ns='common' wait>
              {t => <h1>{t('common:integrates_react-i18next')}</h1>}
            </I18nR>
            <Component {...pageProps} />
          </React.Fragment>
        </I18nextProvider>
      </Container>
    )
  }
}
