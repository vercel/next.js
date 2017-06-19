import Document, { Head, Main, NextScript } from 'next/document'

export default class extends Document {
  render () {
    return (
      <html>
        <Head>
          <script src='/static/hd.min.js' />
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
