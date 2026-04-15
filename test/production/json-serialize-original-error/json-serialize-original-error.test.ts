import { nextTestSetup } from 'e2e-utils'

describe('JSON Serialization', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      test('should fail with original error', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          'Do not know how to serialize a BigInt'
        )
      })
    }
  )
})
