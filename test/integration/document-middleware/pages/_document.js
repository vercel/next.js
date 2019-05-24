import Document, { Html, Head, Main, NextScript } from 'next/document'

export async function middleware ({ req, res }) {
  if (req.url === '/another') {
    res.setHeader('next-middleware', 'hit another!')
    return res.end()
  }
  res.setHeader('next-middleware', 'hi from middleware')
}

class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render () {
    return (
      <Html>
        <Head>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className='custom_class'>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
