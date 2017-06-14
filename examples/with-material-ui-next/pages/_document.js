import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { getDefaultContext, setDefaultContext } from '../styles/createDefaultContext'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    setDefaultContext()
    const page = ctx.renderPage()
    const styleContext = getDefaultContext()
    return {
      ...page,
      styles: <style id='jss-server-side' dangerouslySetInnerHTML={{ __html: styleContext.styleManager.sheetsToString() }} />
    }
  }

  render () {
    const styleContext = getDefaultContext()
    return (
      <html lang='en'>
        <Head>
          <title>My page</title>
          <meta charSet='utf-8' />
          {/* Use minimum-scale=1 to enable GPU rasterization */}
          <meta
            name='viewport'
            content={
              'user-scalable=0, initial-scale=1, maximum-scale=1, ' +
                'minimum-scale=1, width=device-width, height=device-height'
            }
          />
          {/* PWA primary color */}
          <meta name='theme-color' content={styleContext.theme.palette.primary[500]} />
          <link
            rel='stylesheet'
            href='https://fonts.googleapis.com/css?family=Roboto:300,400,500'
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
