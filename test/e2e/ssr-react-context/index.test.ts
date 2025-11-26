import { join } from 'path'
import { renderViaHTTP, check } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'
import { createNext, FileRef } from 'e2e-utils'

describe('React Context', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'context.js': new FileRef(join(__dirname, 'app/context.js')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render a page with context', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toMatch(/Value: .*?hello world/)
  })

  it('should render correctly with context consumer', async () => {
    const html = await renderViaHTTP(next.url, '/consumer')
    expect(html).toMatch(/Value: .*?12345/)
  })

  if ((globalThis as any).isNextDev) {
    it('should render with context after change', async () => {
      const aboutAppPagePath = 'pages/_app.js'
      const originalContent = await next.readFile(aboutAppPagePath)
      await next.patchFile(
        aboutAppPagePath,
        originalContent.replace('hello world', 'new value')
      )

      try {
        await check(() => renderViaHTTP(next.url, '/'), /Value: .*?new value/)
      } finally {
        await next.patchFile(aboutAppPagePath, originalContent)
      }
      await check(() => renderViaHTTP(next.url, '/'), /Value: .*?hello world/)
    })
  }
})
