import Document, { Main, NextScript } from 'next/document'
import Helmet from 'react-helmet'

export default class extends Document {
  static async getInitialProps (...args) {
    const documentProps = await Document.getInitialProps(...args)
    // see https://github.com/nfl/react-helmet#server-usage for more information
    // 'head' was occupied by 'renderPage().head', we cannot use it
    return { ...documentProps, helmet: Helmet.renderStatic() }
  }

  render () {
    const { htmlAttributes, bodyAttributes, ...helmet } = this.props.helmet

    const htmlAttrs = htmlAttributes.toComponent()
    const bodyAttrs = bodyAttributes.toComponent()

    // we replace next's <Head> component and build our own <head> here
    // we could rearrange the head tags in a better order
    // (first meta charset, then title, ...)
    const headComponent = (
      <head>{Object.values(helmet).map(el => el.toComponent())}</head>
    )

    return (
      <html {...htmlAttrs}>
        {headComponent}
        <body {...bodyAttrs}>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
