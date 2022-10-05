import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'

describe('@next/font/google babel', () => {
  const isNextStart = (global as any).isNextStart
  let next: NextInstance

  if (!isNextStart) {
    it('should only run on next start', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: new FileRef(join(__dirname, 'babel')),
      dependencies: {
        '@next/font': 'canary',
      },
    })
  })
  afterAll(() => next.destroy())

  test('Build error when using babel', async () => {
    await expect(next.start()).rejects.toThrow(
      'next build failed with code/signal 1'
    )
    expect(next.cliOutput).toMatch(
      /"experimental.fontLoaders" is enabled which requires SWC although Babel is being used due to custom babel config being present ".babelrc"./
    )
  })
})
