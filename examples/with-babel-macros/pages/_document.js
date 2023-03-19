import { Html, Head, Main, NextScript } from 'next/document'

export default function Document({ css }) {
  return (
    <Html>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
