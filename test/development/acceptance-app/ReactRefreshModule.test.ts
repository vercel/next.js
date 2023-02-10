import { createNext, FileRef } from 'e2e-utils'
import path from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import { sandbox } from './helpers'

describe('ReactRefreshModule app', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  it('should allow any variable names', async () => {
    const { session, cleanup } = await sandbox(next, new Map([]))
    expect(await session.hasRedbox(false)).toBe(false)

    const variables = [
      '_a',
      '_b',
      'currentExports',
      'prevExports',
      'isNoLongerABoundary',
    ]

    for await (const variable of variables) {
      await session.patch(
        'app/page.js',
        `'use client'
        import { default as ${variable} } from 'next/link'
        export default function Page() {
          return null
        }`
      )
      expect(await session.hasRedbox(false)).toBe(false)
      expect(next.cliOutput).not.toContain(
        `'${variable}' has already been declared`
      )
    }

    await cleanup()
  })
})
