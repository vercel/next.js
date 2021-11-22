import { Html, Head, Main, NextScript } from 'next/document'
import Context from '../lib/context'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main>
          {(children) => (
            <Context.Provider value="from render prop">
              {children}
            </Context.Provider>
          )}
        </Main>
        <NextScript />
      </body>
    </Html>
  )
}
