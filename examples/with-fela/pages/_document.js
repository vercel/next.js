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
          <style
            dangerouslySetInnerHTML={{ __html: this.props.css }}
            id='fela-stylesheet'
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
