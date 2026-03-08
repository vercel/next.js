import { nextTestSetup } from 'e2e-utils'

describe('config - circular reference guard', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      'pages/index.js': `
export default function Page() {
  return <p>hello world</p>
}
`,
      // Simulate a config object with a circular reference, similar to what
      // libraries like node-config produce when a config object is parsed with
      // prototype-based circular references. cloneObject must not throw
      // "Maximum call stack size exceeded" in this scenario.
      'next.config.js': `
const circularObj = { env: 'test' }
circularObj.self = circularObj

module.exports = {
  env: {
    CIRCULAR_TEST: 'works',
  },
  // Attach circular reference to the exported config to exercise cloneObject
  _circular: circularObj,
}
`,
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not throw RangeError when config contains circular references', async () => {
    expect(next.cliOutput).not.toContain(
      'Maximum call stack size exceeded'
    )
    expect(next.cliOutput).not.toContain('RangeError')
  })

  it('should correctly serve the page', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
  })
})
