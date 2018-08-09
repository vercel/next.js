import Document, { Head, Main, NextScript } from 'next/document'
import {getStyles} from 'typestyle'
import ReactDOMServer from 'react-dom/server'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const page = renderPage(App => props => ReactDOMServer.renderToString(<App {...props} />))
    const styleTags = getStyles()
    return { ...page, styleTags }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <style id='styles-target'>
            {this.props.styleTags}
          </style>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
