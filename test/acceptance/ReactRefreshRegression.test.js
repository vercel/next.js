/* eslint-env jest */
import { sandbox } from './helpers'

jest.setTimeout(1000 * 60 * 5)

// https://github.com/zeit/next.js/issues/12422
test('styled-components hydration mismatch', async () => {
  const files = new Map()
  files.set(
    'pages/_document.js',
    `
      import Document from 'next/document'
      import { ServerStyleSheet } from 'styled-components'

      export default class MyDocument extends Document {
        static async getInitialProps(ctx) {
          const sheet = new ServerStyleSheet()
          const originalRenderPage = ctx.renderPage

          try {
            ctx.renderPage = () =>
              originalRenderPage({
                enhanceApp: App => props => sheet.collectStyles(<App {...props} />),
              })

            const initialProps = await Document.getInitialProps(ctx)
            return {
              ...initialProps,
              styles: (
                <>
                  {initialProps.styles}
                  {sheet.getStyleElement()}
                </>
              ),
            }
          } finally {
            sheet.seal()
          }
        }
      }
    `
  )

  const [session, cleanup] = await sandbox(undefined, files)

  // We start here.
  const didSsr = !(await session.patch(
    'index.js',
    `
      import React from 'react'
      import styled from 'styled-components'

      const Title = styled.h1\`
        color: red;
        font-size: 50px;
      \`

      export default () => <Title>My page</Title>
    `
  ))

  // Verify loaded from server:
  expect(didSsr).toBe(true)

  // Verify no hydration mismatch:
  expect(await session.hasRedbox()).toBe(false)

  await cleanup()
})
