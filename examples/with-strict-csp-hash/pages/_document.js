import crypto from 'crypto'
import Document, { Head, Main, NextScript } from 'next/document'

const cspHashOf = (text) => {
  const hash = crypto.createHash('sha256')
  hash.update(text)
  return `'sha256-${hash.digest('base64')}'`
}

export default class extends Document {
  render () {
    const csp = `default-src 'self'; script-src 'self' ${cspHashOf(NextScript.getInlineScriptSource(this.props))}`

    return (
      <html>
        <Head>
          <meta httpEquiv='Content-Security-Policy' content={csp} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
