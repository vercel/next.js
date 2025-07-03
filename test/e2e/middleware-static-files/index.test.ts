/* eslint-env jest */

import glob from 'glob'
import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { isNextStart, NextInstance } from 'e2e-utils'

describe('Middleware Runtime', () => {
  let next: NextInstance
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

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
    })
  })
  afterAll(async () => {
    await next.destroy()
  })

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
      const cssChunks = glob.sync('*.css', {
        cwd: join(next.testDir, '.next', 'static', 'css'),
      })

      if (cssChunks.length < 1) {
        throw new Error(`Failed to find CSS chunk`)
      }

      for (const testPath of [
        `/_next/static/css%2f${cssChunks[0]}`,
        `/_next/static/css/${cssChunks[0]}`,
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
