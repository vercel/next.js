import { useAmp } from 'next/amp'
import Document, { Html, Head, Main, NextScript } from 'next/document'

const AmpTst = () => {
  const isAmp = useAmp()
  return <p>{isAmp ? 'AMP Power!!!' : 'no AMP for you...'}</p>
}

class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render () {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <AmpTst />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
