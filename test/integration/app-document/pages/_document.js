import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    let options

    const enhanceComponent = Component => (props) => <div><span id='render-page-html'>RENDERED</span><Component {...props} /></div>
    if (ctx.query.withEnhancer) {
      options = enhanceComponent
    } else if (ctx.query.withEnhanceComponent) {
      options = { enhanceComponent }
    }
    const result = ctx.renderPage(options)

    return { ...result, customProperty: 'Hello Document' }
  }

  render () {
    return (
      <html>
        <Head nonce='test-nonce'>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className='custom_class'>
          <p id='custom-property'>{this.props.customProperty}</p>
          <p id='document-hmr'>Hello Document HMR</p>
          <Main />
          <NextScript nonce='test-nonce' />
        </body>
      </html>
    )
  }
}
