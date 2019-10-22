import Document, { Head, Main, NextScript } from 'next/document'

export default class extends Document {
  render () {
    return (
      <html>
        <Head />
        <body>
          <Main />
          {/* Here we will mount our modal portal */}
          <div id='modal' />
          <NextScript />
        </body>
      </html>
    )
  }
}
