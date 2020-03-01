import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'next-url-prettifier'
import { Router } from '../routes'

export default class GreetingPage extends React.Component {
  static getInitialProps({ query: { lang, name } }) {
    return { lang, name }
  }

  renderSwitchLanguageLink() {
    const { lang, name } = this.props
    const switchLang = lang === 'fr' ? 'en' : 'fr'
    return (
      <Link route={Router.linkPage('greeting', { name, lang: switchLang })}>
        <a>{switchLang === 'fr' ? 'Français' : 'English'}</a>
      </Link>
    )
  }

  render() {
    const { lang, name } = this.props
    return (
      <div>
        <h1>
          {lang === 'fr' ? 'Bonjour' : 'Hello'} {name}
        </h1>
        <div>{this.renderSwitchLanguageLink()}</div>
      </div>
    )
  }
}

GreetingPage.propTypes = {
  lang: PropTypes.string,
  name: PropTypes.string,
}
