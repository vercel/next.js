import Document, { Head, Main, NextScript } from 'next/document'
import { getRenderer } from '../fela'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const page = renderPage()
    const renderer = getRenderer()
    const css = renderer.renderToString()

    renderer.clear()

    return {
      ...page,
      css
    }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <style id='fela-stylesheet'>{this.props.css}</style>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
