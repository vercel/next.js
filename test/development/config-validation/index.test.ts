import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'

describe('config validation - validation only runs once', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
    export default function Page() {
      return <p>hello world</p>
    }
    `,
      'next.config.js': `
    module.exports = {
      invalidOption: 'shouldTriggerValidation',
      anotherBadKey: 'anotherBadValue'
    }
    `,
    },
  })

  it('should validate config only once in root process', async () => {
    await next.fetch('/')
    const output = stripAnsi(next.cliOutput)
    const validationHeaderMatches = output.match(
      /Invalid next\.config\.js options detected:/g
    )
    const validationHeaderCount = validationHeaderMatches
      ? validationHeaderMatches.length
      : 0

    // Count occurrences of specific invalid option mentions
    const invalidOptionMatches = output.match(/invalidOption/g)
    const invalidOptionCount = invalidOptionMatches
      ? invalidOptionMatches.length
      : 0

    const anotherBadKeyMatches = output.match(/anotherBadKey/g)
    const anotherBadKeyCount = anotherBadKeyMatches
      ? anotherBadKeyMatches.length
      : 0

    // Expect validation to have occurred
    expect(output).toContain('Invalid next.config.js options detected')
    expect(output).toContain('invalidOption')
    expect(output).toContain('anotherBadKey')

    // Expect validation header to appear only once (not multiple times from different processes)
    expect(validationHeaderCount).toBe(1)

    // Each invalid option should also appear only once in the validation output
    expect(invalidOptionCount).toBe(1)
    expect(anotherBadKeyCount).toBe(1)
  })
})
