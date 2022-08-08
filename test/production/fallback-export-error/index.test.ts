import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

describe('fallback export error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have built', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('index page')
  })

  it('should not error with default exportPathMap', async () => {
    await next.stop()

    const result = await next.export()
    console.log(result.cliOutput)

    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).not.toContain(
      'Found pages with `fallback` enabled'
    )
  })

  it('should not error with valid exportPathMap', async () => {
    await next.stop()
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        exportPathMap() {
          return {
            '/': { page: '/' },
          }
        }
      }
    `
    )

    try {
      const result = await next.export()
      console.log(result.cliOutput)

      expect(result.exitCode).toBe(0)
      expect(result.cliOutput).not.toContain(
        'Found pages with `fallback` enabled'
      )
    } finally {
      await next.deleteFile('next.config.js')
    }
  })

  it('should error with invalid exportPathMap', async () => {
    await next.stop()
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        exportPathMap() {
          return {
            '/': { page: '/' },
            '/second': { page: '/[...slug]' }
          }
        }
      }
    `
    )

    try {
      const result = await next.export()
      console.log(result.cliOutput)

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain('Found pages with `fallback` enabled')
    } finally {
      await next.deleteFile('next.config.js')
    }
  })
})
