/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  check,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const docPath = join(appDir, 'pages/_document.js')
let appPort
let app

const checkMissing = async (missing = [], docContent) => {
  await fs.writeFile(docPath, docContent)
  let stderr = ''

  appPort = await findPort()
  app = await launchApp(appDir, appPort, {
    onStderr(msg) {
      stderr += msg || ''
    },
  })

  await renderViaHTTP(appPort, '/')

  await check(() => stderr, new RegExp(`missing-document-component`))
  await check(() => stderr, new RegExp(`${missing.join(', ')}`))

  await killApp(app)
  await fs.remove(docPath)
}

describe('Missing _document components error', () => {
  it('should detect missing Html component', async () => {
    await checkMissing(
      ['<Html />'],
      `
      import Document, { Head, Main, NextScript } from 'next/document'

      class MyDocument extends Document {
        render() {
          return (
            <html>
              <Head />
              <body>
                <Main />
                <NextScript />
              </body>
            </html>
          )
        }
      }

      export default MyDocument
    `
    )
  })

  it('should detect missing Head component', async () => {
    await checkMissing(
      ['<Head />'],
      `
      import Document, { Html, Main, NextScript } from 'next/document'

      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <body>
                <Main />
                <NextScript />
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
    `
    )
  })

  it('should detect missing Main component', async () => {
    await checkMissing(
      ['<Main />'],
      `
      import Document, { Html, Head, NextScript } from 'next/document'

      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <Head />
              <body>
                <NextScript />
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
    `
    )
  })

  it('should detect missing NextScript component', async () => {
    await checkMissing(
      ['<NextScript />'],
      `
      import Document, { Html, Head, Main } from 'next/document'

      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <body>
                <Main />
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
    `
    )
  })

  it('should detect multiple missing document components', async () => {
    await checkMissing(
      ['<Head />', '<NextScript />'],
      `
      import Document, { Html, Main } from 'next/document'

      class MyDocument extends Document {
        render() {
          return (
            <Html>
              <body>
                <Main />
              </body>
            </Html>
          )
        }
      }

      export default MyDocument
    `
    )
  })
})
