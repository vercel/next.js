import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static getInitialProps ({ asPath, renderPage, store }) {
    const page = renderPage()

    let htmlStream
    let errorHtmlStream

    if (page.html && typeof page.html !== 'string') {
      htmlStream = page.html
    } else if (page.errorHtml && typeof page.errorHtml !== 'string') {
      errorHtmlStream = page.errorHtml
    }

    return {
      ...page,
      htmlStream,
      errorHtmlStream
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
          <div className='root'>
            <Main />
          </div>
          <NextScript />
        </body>
      </html>
    )
  }
}
