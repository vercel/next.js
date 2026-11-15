import { join } from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

const customDocumentGipContent = `\
import { Html, Main, NextScript, Head } from 'next/document'

export default function Document() {
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

Document.getInitialProps = (ctx) => {
  return ctx.defaultGetInitialProps(ctx)
}
`

const basePath = process.env.TEST_BASE_PATH || ''
const srcPrefix = process.env.TEST_SRC_DIR ? 'src/' : ''

describe('next/dynamic-cross-origin', () => {
  let next: NextInstance

  async function createNextWithCrossOriginConfig(crossOrigin) {
    next = await createNext({
      files: {
        [`${srcPrefix}/components`]: new FileRef(join(__dirname, 'components')),
        [`${srcPrefix}/pages`]: new FileRef(join(__dirname, 'pages')),
        ...(process.env.TEST_CUSTOMIZED_DOCUMENT === '1' && {
          [`${srcPrefix}/pages/_document.js`]: customDocumentGipContent,
        }),
      },
      nextConfig: {
        basePath,
        crossOrigin,
      },
    })
  }

  afterEach(() => next.destroy())

  async function get$(path, query?: any) {
    const html = await renderViaHTTP(next.url, path, query)
    return cheerio.load(html)
  }

  it('should include crossorigin attribute if set in next config', async () => {
    await createNextWithCrossOriginConfig('anonymous')
    const $ = await get$(basePath + '/dynamic/no-chunk')

    $('script').each((_, el) =>
      expect($(el).attr('crossorigin')).toBe('anonymous')
    )
  })

  it('should not include crossorigin attribute if not set', async () => {
    await createNextWithCrossOriginConfig(false)
    const $ = await get$(basePath + '/dynamic/no-chunk')

    $('script').each((_, el) =>
      expect($(el).attr('crossorigin')).toBe(undefined)
    )
  })
})
