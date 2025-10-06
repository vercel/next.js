import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'

describe('fallback export error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
      },
      nextConfig: {
        output: 'export',
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  it('should have built', async () => {
    const result = await next.build()
    expect(result.exitCode).toBe(0)
  })

  it('should not error with default exportPathMap', async () => {
    const result = await next.build()
    console.log(result.cliOutput)

    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).not.toContain(
      'Found pages with `fallback` enabled'
    )
  })

  it('should not error with valid exportPathMap', async () => {
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        output: 'export',
        exportPathMap() {
          return {
            '/': { page: '/' },
          }
        }
      }
    `
    )

    try {
      const result = await next.build()
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
        output: 'export',
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
      const result = await next.build()
      console.log(result.cliOutput)

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain('Found pages with `fallback` enabled')
    } finally {
      await next.deleteFile('next.config.js')
    }
  })
})
