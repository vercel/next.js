import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('next.config.js schema validating - defaultConfig', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
    export default function Page() {
      return <p>hello world</p>
    }
    `,
      'next.config.js': `
    module.exports = (phase, { defaultConfig }) => {
      return defaultConfig
    }
    `,
    },
  })

  it('should validate against defaultConfig', async () => {
    const output = stripAnsi(next.cliOutput)

    expect(output).not.toContain('Invalid next.config.js options detected')
  })
})

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('next.config.js schema validating - invalid config', () => {
  const { next, isNextStart } = nextTestSetup({
    files: {
      'pages/index.js': `
    export default function Page() {
      return <p>hello world</p>
    }
    `,
      'next.config.js': `
    module.exports = {
      badKey: 'badValue'
    }
    `,
    },
  })

  it('should warn the invalid next config', async () => {
    await check(() => {
      const output = stripAnsi(next.cliOutput)
      const warningTimes = output.split('badKey').length - 1

      expect(output).toContain('Invalid next.config.js options detected')
      expect(output).toContain('badKey')
      // for next start and next build we both display the warnings
      expect(warningTimes).toBe(isNextStart ? 2 : 1)

      return 'success'
    }, 'success')
  })
})
