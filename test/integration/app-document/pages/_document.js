import flush from 'styled-jsx/server'
import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    let options

    const enhanceComponent = Component => (props) => <div><span id='render-page-enhance-component'>RENDERED</span><Component {...props} /></div>
    const enhanceApp = Component => (props) => <div><span id='render-page-enhance-app'>RENDERED</span><Component {...props} /></div>

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

    const { styleNonce, scriptNonce } = ctx

    const result = ctx.renderPage(options)
    const styles = flush({ nonce: styleNonce })

    return { ...result, styles, styleNonce, scriptNonce, customProperty: 'Hello Document', withViolation: ctx.query.withViolation }
  }

  render () {
    return (
      <html>
        <Head />
        <body className='custom_class'>
          <script type='text/javascript' dangerouslySetInnerHTML={{ __html: "console.log('logged')" }} nonce={this.props.scriptNonce} crossOrigin='anonymous' />
          <style nonce={this.props.styleNonce}>{`p { font-size: 50px;}`}</style>
          <style jsx>{`p { color: blue }`}</style>
          { this.props.withViolation ? (<style>{`p { color: red }`}</style>) : '' }
          <p id='custom-property'>{this.props.customProperty}</p>
          <p id='document-hmr'>Hello Document HMR</p>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
