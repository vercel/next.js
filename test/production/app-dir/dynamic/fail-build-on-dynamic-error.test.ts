import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'When dynamic=error set',
  { files: __dirname, skipStart: true },
  ({ next }) => {
    it('should fail to build', async () => {
      await expect(next.build()).resolves.toEqual({
        exitCode: 1,
        cliOutput: expect.stringContaining(
          'Error: Page with `dynamic = "error"` couldn\'t be rendered statically because it used `searchParams.get`.'
        ),
      })
    })
  }
)
