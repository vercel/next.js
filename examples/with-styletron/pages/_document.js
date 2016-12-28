import Document, { Head, Main, NextScript } from 'next/document'
import { flush } from '../styletron'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const page = renderPage()
    const styletron = flush()
    const css = styletron ? styletron.getCss() : null
    return { ...page, css }
  }

  render () {
    return (
      <html>
        <Head>
          <title>My page</title>
          <style className='_styletron_hydrate_' dangerouslySetInnerHTML={{ __html: this.props.css }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
