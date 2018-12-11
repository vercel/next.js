import Document, { Head, Main, NextScript } from 'next/document'
import { flush } from '../styletron'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const page = renderPage()
    const styletron = flush()
    const stylesheets = styletron ? styletron.getStylesheets() : []
    return { ...page, stylesheets }
  }

  render () {
    return (
      <html>
        <Head>
          {this.props.stylesheets.map((sheet, i) => (
            <style
              className='_styletron_hydrate_'
              dangerouslySetInnerHTML={{ __html: sheet.css }}
              media={sheet.media || null}
              key={i}
            />
          ))}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
