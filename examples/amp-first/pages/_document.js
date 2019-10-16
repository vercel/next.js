import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

// The language used for all documents.
const DEFAULT_LANG = 'en'

/**
 * A custom document that allows setting the <html lang=en> attribute.
 */
export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
  }
  render () {
    return (
      <html lang={DEFAULT_LANG} amp=''>
        <Head />
        <body>
          {this.props.customValue}
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
