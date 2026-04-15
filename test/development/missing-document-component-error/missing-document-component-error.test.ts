import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Missing _document components error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function checkMissing(missing: string[], docContent: string) {
    const outputIndex = next.cliOutput.length
    await next.patchFile('pages/_document.js', docContent)

    await next.render('/').catch(() => {})

    await retry(async () => {
      const newOutput = next.cliOutput.slice(outputIndex)
      expect(newOutput).toContain('missing-document-component')
      expect(newOutput).toContain(missing.join(', '))
    })

    await next.deleteFile('pages/_document.js')
  }

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
