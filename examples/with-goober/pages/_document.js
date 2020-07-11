import Document, { Head, Main, NextScript } from 'next/document'
import { extractCss } from 'goober'

export default class MyDocument extends Document {
  static getInitialProps({ renderPage }) {
    const page = renderPage()

    // Extrach the css for each page render
    const css = extractCss()
    return { ...page, css }
  }

  render() {
    return (
      <html>
        <Head>
          <style
            id={'_goober'}
            // And defined it in here
            dangerouslySetInnerHTML={{ __html: ' ' + this.props.css }}
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
