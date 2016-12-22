import Document, { Head, Main, NextScript } from 'next/document'
import styleSheet from 'styled-components/lib/models/StyleSheet'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const renderPage = () => {
      return ctx.renderPage()
    }

    const props = await Document.getInitialProps({ ...ctx, renderPage })
    const style = styleSheet.rules().map(rule => rule.cssText).join('\n')
    return { ...props, style }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <style dangerouslySetInnerHTML={{ __html: this.props.style }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
