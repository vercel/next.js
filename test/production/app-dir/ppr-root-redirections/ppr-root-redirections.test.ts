import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'ppr-root-redirections',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not bail out', async () => {
      expect(next.cliOutput).not.toContain('bail out')
    })
  }
)
