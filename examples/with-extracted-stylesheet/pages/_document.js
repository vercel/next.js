import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
  }

  render () {
    const { __NEXT_DATA__ } = this.props

    return (
      <html>
        <Head>
          {process.env.NODE_ENV === 'development' ? (
            <link
              rel='stylesheet'
              type='text/css'
              href='/static/assets/index.css'
            />
          ) : (
            <link
              rel='stylesheet'
              type='text/css'
              href={`/static/assets/${__NEXT_DATA__.buildId}.css`}
            />
          )}
          <link rel='shortcut icon' href={require('../static/favicon.png')} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
