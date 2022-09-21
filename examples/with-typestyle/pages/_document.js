import { Html, Head, Main, NextScript } from 'next/document'
import { getStyles } from 'typestyle'

export default function Document({ styleTags }) {
  return (
    <Html>
      <Head>
        <style id="styles-target">{styleTags}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

Document.getInitialProps = async ({ renderPage }) => {
  const page = await renderPage()
  const styleTags = getStyles()
  return { ...page, styleTags }
}
