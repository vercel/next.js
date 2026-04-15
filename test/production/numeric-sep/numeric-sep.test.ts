import { nextTestSetup } from 'e2e-utils'

describe('Numeric Separator Support', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({ files: __dirname })

      it('should successfully build for a JavaScript file', async () => {
        expect(next.cliOutput).toContain('Compiled successfully')
        expect(next.cliOutput).not.toContain('Failed to compile')
      })
    }
  )
})
