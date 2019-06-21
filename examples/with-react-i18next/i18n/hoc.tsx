import i18next from 'i18next'
import { NextAppContext } from 'next/app'
import { DefaultQuery } from 'next/router'
import React from 'react'
import { I18nextProvider, withSSR } from 'react-i18next'

import i18n from './client'

export default function withI18n(WrappedComponent: any) {
  function AppWithTranslation(props: any) {
    const WrappedComponentWithSSR = withSSR()(WrappedComponent)

    return (
      <I18nextProvider i18n={props.i18nServerInstance || i18n}>
        <WrappedComponentWithSSR {...props} />
      </I18nextProvider>
    )
  }

  AppWithTranslation.getInitialProps = async (
    context: NextAppContext<DefaultQuery, { i18n: i18next.i18n }>
  ) => {
    const { req } = context.ctx

    let i18nServerInstance = null
    const initialLanguage = req ? req.i18n.language : i18n.language
    const services = req ? req.i18n.services : i18n.services

    if (req && req.i18n) {
      // @ts-ignore not seems to be defined but without this some circular errors may appear
      req.i18n.toJSON = () => null
      i18nServerInstance = req.i18n
    }

    return {
      i18nServerInstance,
      initialI18nStore: services.resourceStore.data,
      initialLanguage,
      pageProps: WrappedComponent.getInitialProps
        ? await WrappedComponent.getInitialProps(context)
        : {},
    }
  }

  return AppWithTranslation
}
