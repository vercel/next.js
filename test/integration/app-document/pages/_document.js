import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)

    const { html: renderPageHtml } = ctx.renderPage(Component => (props) => <div>RENDERED<Component {...props} /></div>)

    return { ...initialProps, customProperty: 'Hello Document', renderPageHtml }
  }

  render () {
    return (
      <html>
        <Head nonce='test-nonce'>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className='custom_class'>
          <p id='custom-property'>{this.props.customProperty}</p>
          <p id='render-page-html'>{this.props.renderPageHtml}</p>
          <p id='document-hmr'>Hello Document HMR</p>
          <Main />
          <NextScript nonce='test-nonce' />
        </body>
      </html>
    )
  }
}
