import Document, { Head, Main, NextScript } from 'next/document'
import { StyleSheetServer } from 'aphrodite'

export default class MyDocument extends Document {
  static async getInitialProps ({ renderPage }) {
    const { html, css } = StyleSheetServer.renderStatic(() => renderPage())
    const ids = css.renderedClassNames
    return { ...html, css, ids }
  }

  constructor (props) {
    super(props)
    /* Take the renderedClassNames from aphrodite (as generated
     in getInitialProps) and assign them to __NEXT_DATA__ so that they
     are accessible to the client for rehydration. */
    const { __NEXT_DATA__, ids } = props
    if (ids) {
      __NEXT_DATA__.ids = this.props.ids
    }
  }

  render () {
    /* Make sure to use data-aphrodite attribute in the style tag here
     so that aphrodite knows which style tag it's in control of when
     the client goes to render styles. If you don't you'll get a second
     <style> tag */
    return (
      <html>
        <Head>
          <style data-aphrodite dangerouslySetInnerHTML={{ __html: this.props.css.content }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
