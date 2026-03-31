import { nextTestSetup } from 'e2e-utils'

describe('rsc layers transform', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should render installed react-server condition for middleware', async () => {
    const json = await next.fetch('/middleware').then((res) => res.json())

    expect(json).toEqual({
      textValue: 'text-value',
      linkType: 'function',
    })
  })

  if (!isNextDeploy) {
    it('should call instrumentation hook without errors', async () => {
      const output = next.cliOutput
      expect(output).toContain('instrumentation:register')
      expect(output).toContain('instrumentation:text:text-value')
    })
  }
})
