import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Turbopack does not support `.babelrc`. So this test is not relevant for Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  '@next/font babel unsupported',
  () => {
    const { next } = nextTestSetup({
      skipStart: true,
      files: new FileRef(join(__dirname, 'babel-unsupported')),
    })

    test('Build error when using babel', async () => {
      await expect(next.start()).rejects.toThrow(
        'next build failed with code/signal 1'
      )
      expect(next.cliOutput).toMatch(
        /"next\/font" requires SWC although Babel is being used due to a custom babel config being present./
      )
    })
  }
)
