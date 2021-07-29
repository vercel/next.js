import Document, { Head, Html, Main, NextScript } from 'next/document'

class NextDocument extends Document {
  render() {
    return (
      <Html>
        <Head nonce="abc" />
        <body>
          <Main />
          <NextScript nonce="abc" />
        </body>
      </Html>
    )
  }
}

export default NextDocument
