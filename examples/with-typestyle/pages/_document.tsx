import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentInitialProps,
  DocumentContext,
} from 'next/document'
import { getStyles } from 'typestyle'

export default function MyDocument() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

MyDocument.getInitialProps = async (
  ctx: DocumentContext
): Promise<DocumentInitialProps> => {
  const initialProps = await Document.getInitialProps(ctx)
  const styleTags = getStyles()
  return {
    ...initialProps,
    styles: (
      <>
        {initialProps.styles}
        <style id="typestyle-target">{styleTags}</style>
      </>
    ),
  }
}
