import Document from 'next/document'
import { createCss } from '@stitches/css'
import { config } from '../css'

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const css = createCss(config)
    const originalRenderPage = ctx.renderPage

    try {
      ctx.renderPage = () =>
        originalRenderPage({
          enhanceApp: (App) => (props) => <App {...props} serverCss={css} />,
        })

      const initialProps = await Document.getInitialProps(ctx)
      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            <style>{css.getStyles()}</style>
          </>
        ),
      }
    } finally {
    }
  }
}
