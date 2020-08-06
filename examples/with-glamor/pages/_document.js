import Document, { Html, Head, Main, NextScript } from 'next/document'
import { renderStatic } from 'glamor/server'

class MyDocument extends Document {
  static async getInitialProps({ renderPage }) {
    const page = await renderPage()
    const { css, ids } = renderStatic(() => page.html || page.errorHtml)
    return { ...page, css, ids }
  }

  render() {
    const { ids, css } = this.props
    return (
      <Html>
        <Head>
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </Head>
        <body>
          <Main />
          <NextScript />
          {ids && (
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.__REHYDRATE_IDS = ${JSON.stringify(ids)}
                `,
              }}
            />
          )}
        </body>
      </Html>
    )
  }
}

export default MyDocument
