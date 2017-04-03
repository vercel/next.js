import React, { Component } from 'react'
import { I18nextProvider } from 'react-i18next'
import startI18n from '../tools/startI18n'
import { getTranslation } from '../tools/translationHelpers'
import Title from '../components/Title'

export default class Homepage extends Component {
  static async getInitialProps () {
    const translations = await getTranslation('pt', 'common', 'http://localhost:3000/static/locales/')

    return { translations }
  }

  constructor (props) {
    super(props)

    this.i18n = startI18n(props.translations)
  }

  render (props) {
    return (
      <I18nextProvider i18n={this.i18n}>
        <Title />
      </ I18nextProvider>
    )
  }
}
