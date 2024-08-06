import crypto from 'crypto'
import Document, { Html, Head, Main, NextScript } from 'next/document'

const cspHashOf = (text) => {
  const hash = crypto.createHash('sha256')
  hash.update(text)
  return `'sha256-${hash.digest('base64')}'`
}

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    let options

    const enhanceComponent = (Component) => (props) => (
      <div>
        <span id="render-page-enhance-component">RENDERED</span>
        <Component {...props} />
      </div>
    )
    const enhanceApp = (Component) => (props) => (
      <div>
        <span id="render-page-enhance-app">RENDERED</span>
        <Component {...props} />
      </div>
    )

    if (ctx.query.withEnhancer) {
      options = enhanceComponent
    } else if (ctx.query.withEnhanceComponent || ctx.query.withEnhanceApp) {
      options = {}
      if (ctx.query.withEnhanceComponent) {
        options.enhanceComponent = enhanceComponent
      }
      if (ctx.query.withEnhanceApp) {
        options.enhanceApp = enhanceApp
      }
    }

    const result = await ctx.renderPage(options)

    return {
      ...result,
      cssInJsCount: (result.html.match(/css-in-js-class/g) || []).length,
      customProperty: 'Hello Document',
      withCSP: ctx.query.withCSP,
    }
  }

  render() {
    let csp
    // eslint-disable-next-line default-case
    switch (this.props.withCSP) {
      case 'hash':
        csp = `default-src 'self'; script-src 'self' ${cspHashOf(
          NextScript.getInlineScriptSource(this.props)
        )}; style-src 'self' 'unsafe-inline'`
        break
      case 'nonce':
        csp = `default-src 'self'; script-src 'self' 'nonce-test-nonce'; style-src 'self' 'unsafe-inline'`
        break
    }

    return (
      <Html className="test-html-props">
        <Head nonce="test-nonce">
          {csp ? (
            <meta httpEquiv="Content-Security-Policy" content={csp} />
          ) : null}
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className="custom_class">
          <p id="custom-property">{this.props.customProperty}</p>
          <p id="document-hmr">Hello Document HMR</p>
          <Main />
          <NextScript nonce="test-nonce" />
          <div id="css-in-cjs-count">{this.props.cssInJsCount}</div>
        </body>
      </Html>
    )
  }
}
