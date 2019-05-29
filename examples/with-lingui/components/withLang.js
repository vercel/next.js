import React from 'react'
import { I18nProvider } from '@lingui/react'

export default (Component, defaultLang = 'en') =>
  class WithLang extends React.Component {
    static async getInitialProps (ctx) {
      const language = ctx.query.lang || defaultLang
      const [props, catalog] = await Promise.all([
        Component.getInitialProps ? Component.getInitialProps(ctx) : {},
        import(`../locale/${language}/messages.po`).then(m => m.default)
      ])

      return {
        ...props,
        language,
        catalogs: {
          [language]: catalog
        }
      }
    }

    render () {
      const { language, catalogs, ...restProps } = this.props

      return (
        <I18nProvider
          language={language}
          catalogs={catalogs}
        >
          <Component {...restProps} />
        </I18nProvider>
      )
    }
  }
