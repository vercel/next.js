/* eslint-env jest */

import { join } from 'path'
import { FileRef, isNextStart, nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'

describe('Middleware Runtime', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, 'app')),
  })
  let testPaths: Array<{ testPath: string }> = [
    { testPath: '/file.svg' },
    { testPath: '/vercel copy.svg' },
    { testPath: '/vercel%20copy.svg' },
    { testPath: '/another%2ffile.svg' },
    { testPath: '/another/file.svg' },
    { testPath: '/another/hello' },
    { testPath: '/another%2fhello' },
    { testPath: '/glob%2ffile.svg' },
    { testPath: '/glob/file.svg' },
    { testPath: '/dynamic%2f/first' },
    { testPath: '/dynamic/first' },
    { testPath: '/glob%2fhello' },
    { testPath: '/glob/hello' },
    { testPath: '/pages-another/hello' },
    { testPath: '/pages-another%2fhello' },
    { testPath: '/pages-dynamic%2f/first' },
    { testPath: '/pages-dynamic/first' },
    { testPath: '/pages-glob%2fhello' },
    { testPath: '/pages-glob/hello' },
  ]

  it.each(testPaths)(
    'should match middleware correctly for $testPath',
    async ({ testPath }) => {
      const res = await next.fetch(testPath, {
        redirect: 'manual',
      })

      if (res.status === 404) {
        expect(await res.text()).toContain('page could not be found')
      } else {
        expect(await res.json()).toEqual({ middleware: true })
      }
    }
  )

  if (isNextStart && !process.env.IS_TURBOPACK_TEST) {
    it('should match middleware of _next/static', async () => {
      const cssChunks = (
        await listClientChunks(join(next.testDir, next.distDir))
      ).filter((f) => f.endsWith('.css'))

      if (cssChunks.length < 1) {
        throw new Error(`Failed to find CSS chunk`)
      }

      for (const testPath of [
        `/_next%2f${cssChunks[0]}`,
        `/_next/${cssChunks[0]}`,
      ]) {
        const res = await next.fetch(testPath, {
          redirect: 'manual',
        })

        if (res.status === 404) {
          expect(await res.text()).toContain('page could not be found')
        } else {
          expect(await res.json()).toEqual({ middleware: true })
        }
      }
    })
  }
})
