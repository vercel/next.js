import Document, { Html, Head, Main, NextScript } from 'next/document'
import * as React from 'react'
import { renderStatic } from '../shared/renderer'

// Please note: - the reason for data-emotion-ssr={JSON.stringify(ids)} is because
// hydrate can't find the ids if we set them using window.__ids
// adding this and looking for it in _app.js allows it to always be ready so we just parse that attribute to get the ids array
export default class AppDocument extends Document {
  static async getInitialProps(ctx) {
    const page = await ctx.renderPage()
    const { css, ids } = await renderStatic(() => page.html)
    const initialProps = await Document.getInitialProps(ctx)
    return {
      ...initialProps,
      styles: (
        <React.Fragment>
          {initialProps.styles}
          <style
            data-emotion={`css ${ids.join(' ')}`}
            dangerouslySetInnerHTML={{ __html: css }}
          />
        </React.Fragment>
      ),
    }
  }

  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
