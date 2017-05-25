import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

// custom component
import CSSTag from '@/components/CSSTag'

// styles
import style from '@/styles/global.scss'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
  }

  render () {
    return (
      <html>
        <Head>
          <link rel='stylesheet' href='/static/css/app.css' />
          <link rel='icon' href='https://cdn.zeit.co/favicon/favicon.ico' />
          <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' />
          <CSSTag style={style} />
        </Head>
        <body className='custom_class'>
          {this.props.customValue}
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
