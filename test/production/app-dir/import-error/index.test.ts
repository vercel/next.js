import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir import error',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should show import error with layer info', async () => {
      const output = next.cliOutput
      expect(output).toContain(
        `Attempted import error: 'Foo' is not exported from './lib' (imported as 'Foo'). (layer: rsc)`
      )
    })
  }
)
