import { nextTestSetup } from 'e2e-utils'

describe('rsc layers transform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render installed react-server condition for middleware', async () => {
    const json = await next
      .fetch('/middleware-transform')
      .then((res) => res.json())
    expect(json.textValue).toBe('text-value')
  })

  it('should call instrumentation hook without errors', async () => {
    const output = next.cliOutput
    expect(output).toContain('instrumentation:register')
  })
})
