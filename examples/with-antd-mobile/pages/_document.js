import Document, { Head, Main, NextScript } from 'next/document'

// Note that antd-mobile docs initialize fast click here
// but it may not be required: https://github.com/ant-design/ant-design-mobile/issues/576
// https://developers.google.com/web/updates/2013/12/300ms-tap-delay-gone-away

export default class extends Document {
  render () {
    return (
      <html>
        <Head>

          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no" />

          <link rel='stylesheet' type='text/css' href='//unpkg.com/antd-mobile/dist/antd-mobile.min.css' />
        </Head>
        <body style={{margin: 0}}>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
