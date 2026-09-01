import Document, { Html, Head, Main, NextScript } from 'next/document'
import Image from 'next/image'
import img from '../public/test.jpg'

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Image src={img} />
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
