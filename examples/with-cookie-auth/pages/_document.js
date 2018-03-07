import Document, { Head, Main, NextScript } from 'next/document'
import { getServerSideToken, getUserScript } from '../lib/auth'

export default class extends Document {
  static async getInitialProps (ctx) {
    const props = await Document.getInitialProps(ctx)
    const info = getServerSideToken(ctx.req)
    return { ...props, ...info }
  }

  render () {
    const { user = {} } = this.props
    return (
      <html lang='en'>
        <Head />
        <body>
          <Main />
          <script dangerouslySetInnerHTML={{ __html: getUserScript(user) }} />
          <NextScript />
        </body>
      </html>
    )
  }
}
