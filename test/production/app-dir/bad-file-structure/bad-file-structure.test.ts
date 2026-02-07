import { nextTestSetup } from 'e2e-utils'

describe('bad-file-structure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  it('should error for bad file structure', async () => {
    await next.build()

    const output = next.cliOutput
    expect(output).toContain(
      '`pages` and `app` directories should be under the same folder'
    )
  })
})
