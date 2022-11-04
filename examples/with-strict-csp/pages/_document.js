import crypto from 'crypto'
import { Html, Head, Main, NextScript } from 'next/document'

const cspHashOf = (text) => {
  const hash = crypto.createHash('sha256')
  hash.update(text)
  return `'sha256-${hash.digest('base64')}'`
}
export default function Document(ctx) {
  let csp = `default-src 'self'; script-src 'self' ${cspHashOf(
    NextScript.getInlineScriptSource(ctx)
  )}`
  if (process.env.NODE_ENV !== 'production') {
    csp = `style-src 'self' 'unsafe-inline'; font-src 'self' data:; default-src 'self'; script-src 'unsafe-eval' 'self' ${cspHashOf(
      NextScript.getInlineScriptSource(ctx)
    )}`
  }

  return (
    <Html>
      <Head>
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
