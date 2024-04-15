import stripAnsi from 'strip-ansi'
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'next.config.js schema validating - defaultConfig',
  {
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
    skipDeployment: true,
  },
  ({ next }) => {
    it('should validate against defaultConfig', async () => {
      const output = stripAnsi(next.cliOutput)

      expect(output).not.toContain('Invalid next.config.js options detected')
    })
  }
)

createNextDescribe(
  'next.config.js schema validating - invalid config',
  {
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
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
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
  }
)
