import { Head, Html, Main, NextScript } from 'next/document'
import { getCssText } from '../stitches.config'

const MyDocument = () => (
  <Html lang="en">
    <Head>
      <style id="stitches" dangerouslySetInnerHTML={{ __html: getCssText() }} />
    </Head>
    <body>
      <Main />
      <NextScript />
    </body>
  </Html>
)

export default MyDocument
