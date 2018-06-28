import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, customProperty: 'Hello Document' }
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
