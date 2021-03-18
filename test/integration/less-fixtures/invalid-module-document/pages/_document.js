import Document, { Head, Html, Main, NextScript } from 'next/document'
import styles from '../styles.module.less'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html>
        <Head />
        <body className={styles['red-text']}>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
