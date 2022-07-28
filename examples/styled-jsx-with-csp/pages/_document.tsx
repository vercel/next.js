import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from 'next/document'
import { nanoid } from 'nanoid'

class CustomDocument extends Document {
  public props: any

  static async getInitialProps(ctx: DocumentContext) {
    const nonce = nanoid()
    const docProps = await ctx.defaultGetInitialProps(ctx, { nonce })

    let contentSecurityPolicy = ''
    if (process.env.NODE_ENV === 'production') {
      contentSecurityPolicy = `default-src 'self'; style-src 'nonce-${nonce}';`
    } else {
      // react-refresh needs 'unsafe-eval'
      // Next.js needs 'unsafe-inline' during development https://github.com/vercel/next.js/blob/canary/packages/next/client/dev/fouc.js
      // Specifying 'nonce' makes a modern browsers ignore 'unsafe-inline'
      contentSecurityPolicy = `default-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-eval';`
    }

    ctx.res?.setHeader('Content-Security-Policy', contentSecurityPolicy)

    return { ...docProps, nonce }
  }

  render() {
    return (
      <Html>
        <Head>
          {/* Styled-JSX will add this `nonce` to style tags on Client Side Rendering */}
          {/* https://github.com/vercel/styled-jsx/blob/master/src/lib/stylesheet.js#L31 */}
          {/* https://github.com/vercel/styled-jsx/blob/master/src/lib/stylesheet.js#L240 */}
          <meta property="csp-nonce" content={this.props.nonce} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default CustomDocument
