// _document is only rendered on the server side and not on the client side
// Event handlers like onClick can't be added to this file

// ./pages/_document.js
import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    const customProperty = 'Hello Document'
    return { html, head, errorHtml, chunks, styles, customProperty }
  }

  render () {
    return (
      <html>
        <Head>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className='custom_class'>
          <p id='hello-document'>{this.props.customProperty}</p>
          <p id='document-hmr'>Hello Document HMR</p>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
