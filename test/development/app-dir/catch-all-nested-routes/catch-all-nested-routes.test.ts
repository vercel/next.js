import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const imageFile = `import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(<div style={{ display: 'flex' }}>image</div>, size)
}
`

const pageFile = `export default function Page() {
  return <p>nested</p>
}
`

const routeFile = `export function GET() {
  return new Response('nested')
}
`

function getFileContent(file: string) {
  if (file.endsWith('page.tsx')) return pageFile
  if (file.endsWith('route.ts')) return routeFile
  // Static metadata files are rejected before their content is read.
  if (file.endsWith('.png')) return 'not a real image'
  return imageFile
}

// Webpack's dev server still exits on start with "Catch-all must be the last
// part of the URL." for these fixtures, so only Turbopack is covered here.
// @force-gate turbopack
describe('catch-all-nested-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function expectOk(pathname: string, selector: string, text: string) {
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($(selector).text()).toBe(text)
  }

  async function expectValidRoutes() {
    await retry(async () => {
      await expectOk('/section', '#section', 'section: ')
      await expectOk('/section/a/b', '#section', 'section: a/b')
      await expectOk('/docs/a', '#docs', 'docs: a')
    }, 30_000)
  }

  /**
   * Adds files that would create a route nested below a catch-all segment,
   * checks that the dev server keeps running and reports a regular error
   * (instead of a fatal internal error), then removes the files again and
   * checks that the app recovers without a restart.
   */
  async function expectReportedAndRecovered({
    files,
    requestPath,
    expectedMessages,
    expectedInResponse,
    restart = false,
  }: {
    files: string[]
    requestPath: string
    /** Messages expected in the CLI output. */
    expectedMessages: string[]
    /**
     * Text expected in the error page, which embeds the first error.
     */
    expectedInResponse: string
    /** Add the files while the dev server is stopped, then start it. */
    restart?: boolean
  }) {
    if (restart) {
      await next.stop()
    }
    const outputStart = next.cliOutput.length
    try {
      for (const file of files) {
        await next.patchFile(file, getFileContent(file))
      }
      if (restart) {
        await next.start()
      }

      await retry(async () => {
        const res = await next.fetch(requestPath)
        expect(res.status).toBe(500)
        expect(await res.text()).toContain(expectedInResponse)
        const output = stripAnsi(next.cliOutput.slice(outputStart))
        for (const message of expectedMessages) {
          expect(output).toContain(message)
        }
      }, 30_000)
    } finally {
      for (const file of files) {
        await next.deleteFile(file)
      }
    }

    await expectValidRoutes()

    const output = next.cliOutput.slice(outputStart)
    expect(output).not.toContain('TurbopackInternalError')
    expect(output).not.toContain('FATAL')
  }

  it('serves catch-all routes with non-route files in nested directories', async () => {
    await expectValidRoutes()
    expect(next.cliOutput).not.toContain('catch-all segment')
  })

  it('reports metadata image files inside an optional catch-all segment', async () => {
    await expectReportedAndRecovered({
      files: [
        'app/section/[[...slug]]/opengraph-image.tsx',
        'app/section/[[...slug]]/twitter-image.tsx',
      ],
      requestPath: '/section',
      expectedMessages: [
        "Metadata file app/section/[[...slug]]/opengraph-image.tsx can't be used inside the catch-all segment [[...slug]]",
        "Metadata file app/section/[[...slug]]/twitter-image.tsx can't be used inside the catch-all segment [[...slug]]",
        'the metadata route /section/[[...slug]]/opengraph-image can never be matched',
      ],
      expectedInResponse: 'can never be matched',
    })
  })

  it('reports metadata image files inside a catch-all segment', async () => {
    await expectReportedAndRecovered({
      files: ['app/docs/[...slug]/icon.tsx'],
      requestPath: '/docs/a',
      expectedMessages: [
        "Metadata file app/docs/[...slug]/icon.tsx can't be used inside the catch-all segment [...slug]",
      ],
      expectedInResponse: 'app/docs/[...slug]/icon.tsx',
    })
  })

  it('reports pages nested below a catch-all segment', async () => {
    await expectReportedAndRecovered({
      files: ['app/section/[[...slug]]/extra/page.tsx'],
      requestPath: '/section',
      expectedMessages: [
        "Routes in app/section/[[...slug]]/extra can't be nested inside the catch-all segment [[...slug]]",
      ],
      expectedInResponse: 'app/section/[[...slug]]/extra',
    })
  })

  it('reports route handlers and static metadata files nested below a catch-all segment', async () => {
    await expectReportedAndRecovered({
      files: [
        'app/docs/[...slug]/api/route.ts',
        'app/docs/[...slug]/apple-icon.png',
      ],
      requestPath: '/docs/a',
      expectedMessages: [
        "Routes in app/docs/[...slug]/api can't be nested inside the catch-all segment [...slug]",
        "Metadata file app/docs/[...slug]/apple-icon.png can't be used inside the catch-all segment [...slug]",
      ],
      expectedInResponse: 'can never be matched',
    })
  })

  it('starts the dev server when such files already exist', async () => {
    await expectReportedAndRecovered({
      restart: true,
      files: [
        'app/section/[[...slug]]/opengraph-image.tsx',
        'app/section/[[...slug]]/twitter-image.tsx',
        'app/section/[[...slug]]/a/b/page.tsx',
      ],
      requestPath: '/section',
      expectedMessages: [
        "Metadata file app/section/[[...slug]]/opengraph-image.tsx can't be used inside the catch-all segment [[...slug]]",
        "Metadata file app/section/[[...slug]]/twitter-image.tsx can't be used inside the catch-all segment [[...slug]]",
        "Routes in app/section/[[...slug]]/a can't be nested inside the catch-all segment [[...slug]]",
      ],
      expectedInResponse: 'can never be matched',
    })
  })
})
