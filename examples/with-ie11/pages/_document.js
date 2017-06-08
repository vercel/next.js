import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (context) {
    const props = await super.getInitialProps(context)

    const userAgent = context.req.headers['user-agent']
    const isIE11 = !!userAgent.match(/Trident\/7\./)

    return { ...props, isIE11 }
  }

  render () {
    return (
      <html>
        <Head>
          {this.props.isIE11 ? (
            <script src='https://cdnjs.cloudflare.com/ajax/libs/es6-promise/4.0.5/es6-promise.auto.js' />
         ) : null}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
