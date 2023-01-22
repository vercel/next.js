import { Html, Main, NextScript, Head } from 'next/document'

function Doc() {
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

Doc.getInitialProps = (ctx) => {
  return ctx.defaultGetInitialProps(ctx)
}

export default Doc
