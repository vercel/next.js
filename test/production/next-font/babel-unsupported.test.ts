import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'

describe('@next/fon babel unsupported', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: new FileRef(join(__dirname, 'babel-unsupported')),
    })
  })
  afterAll(() => next.destroy())

  test('Build error when using babel', async () => {
    await expect(next.start()).rejects.toThrow(
      'next build failed with code/signal 1'
    )
    expect(next.cliOutput).toMatch(
      /"next\/font" requires SWC although Babel is being used due to a custom babel config being present./
    )
  })
})
