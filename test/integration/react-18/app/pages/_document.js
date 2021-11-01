import { Html, Head, Main, NextScript } from 'next/document'
import Context from '../components/context'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main>
          {(content) => (
            <Context.Provider value="from main render prop">
              {content}
            </Context.Provider>
          )}
        </Main>
        <NextScript />
      </body>
    </Html>
  )
}
