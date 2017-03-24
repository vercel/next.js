import React, { Component } from 'react'
import { I18nextProvider } from 'react-i18next'
import startI18n from './i18n'
import { getTranslation } from '../tools/translationHelpers'

export default class Homepage extends Component {
  static async getInitialProps ({ req }) {
    const isServer = !!req
    const translations = await getTranslation('en', 'common')
    const i18n = startI18n(translations, isServer)


    return { isServer, translations }
  }

  constructor(props) {
    super(props)

    this.i18n = startI18n(props.translations)
  }

  render (props) {
    return (
      <I18nextProvider i18n={ this.i18n }>
        <h1>hello world</h1>
      </ I18nextProvider>
    )
  }
}