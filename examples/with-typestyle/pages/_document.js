import Document, { Head, Main, NextScript } from 'next/document'
import {getStyles} from 'typestyle'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const page = renderPage()
    const styleTags = getStyles()
    return { ...page, styleTags }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <style id='styles-target'>
            {this.props.styleTags}
          </style>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
