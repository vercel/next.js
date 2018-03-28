import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { ServerStyleSheet } from 'styled-components'

export default class MyDocument extends Document {
  static getInitialProps ({ asPath, renderPage, store }) {
    const sheet = new ServerStyleSheet()
    const page = renderPage(App => props =>
      sheet.collectStyles(<App {...props} />)
    )

    let htmlStream
    let errorHtmlStream
    let styleTags

    if (page.html && typeof page.html !== 'string') {
      htmlStream = sheet.interleaveWithNodeStream(page.html)
    } else if (page.errorHtml && typeof page.errorHtml !== 'string') {
      errorHtmlStream = sheet.interleaveWithNodeStream(page.errorHtml)
    } else {
      // Included for the synchronous /b route, see below.
      styleTags = sheet.getStyleElement()
    }

    return {
      ...page,
      htmlStream,
      errorHtmlStream,
      styleTags
    }
  }

  // Note: This isn't used by the streaming route (/a), only /b for comparison's sake.
  render () {
    return (
      <html lang='en'>
        <Head>
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
          />
        </Head>
        <body>
          {this.props.styleTags}
          <div className='root'>
            <Main />
          </div>
          <NextScript />
        </body>
      </html>
    )
  }
}
