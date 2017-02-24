import Document, { Head, Main, NextScript } from 'next/document'
import Helmet from 'react-helmet'

export default class extends Document {
  static async getInitialProps ({ renderPage }) {
      const page = renderPage()

      // see https://github.com/nfl/react-helmet#server-usage for more information
      // 'head' was occupied by 'page.head', we cannot use it
      return { ...page, helmetHead: Helmet.rewind() }
  }

  // should render on <html>
  get helmetHtmlAttrComponents() {
    return this.props.helmetHead.htmlAttributes.toComponent()
  }

  // should render on <head>
  get helmetHeadComponents() {
    return Object.keys(this.props.helmetHead)
      .filter(el => el != "htmlAttributes") // remove htmlAttributes which is not for <head> but for <html>
      .map(el => this.props.helmetHead[el].toComponent())
  }

  get helmetJsx() {
    return (<Helmet
      title="Hello next.js!"
    />)
  }

  render () {
    return (<html {...this.helmetHtmlAttrComponents}>
       <Head>
         { this.helmetJsx }
         { this.helmetHeadComponents }
       </Head>
       <body>
           <Main />
           <NextScript />
       </body>
    </html>)
  }
}
