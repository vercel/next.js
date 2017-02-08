import Document, { Head, Main, NextScript } from 'next/document'
import styleSheet from 'styled-components/lib/models/StyleSheet'

import '../styles/globals'

export default class MyDocument extends Document {
  static async getInitialProps ({ renderPage }) {
    const page = renderPage()
    const style = styleSheet.getCSS()
    return { ...page, style }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <link
            href='https://fonts.googleapis.com/css?family=Lato'
            rel='stylesheet'
          />
          <style dangerouslySetInnerHTML={{ __html: this.props.style }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
