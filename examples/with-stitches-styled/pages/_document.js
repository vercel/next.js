import Document from 'next/document'
import { css } from '../css'

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const originalRenderPage = ctx.renderPage

    try {
      let extractedStyles
      ctx.renderPage = () => {
        const { styles, result } = css.getStyles(originalRenderPage)
        extractedStyles = styles
        return result
      }

      const initialProps = await Document.getInitialProps(ctx)

      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {extractedStyles.map((content, index) => (
              <style key={index}>{content}</style>
            ))}
          </>
        ),
      }
    } finally {
    }
  }
}
