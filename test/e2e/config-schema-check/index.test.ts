import stripAnsi from 'strip-ansi'
import { createNextDescribe } from 'e2e-utils'

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
  },
  ({ next }) => {
    it('should warn the invalid next config', async () => {
      const output = stripAnsi(next.cliOutput)
      const warningTimes = output.split('badKey').length - 1

      expect(output).toContain('Invalid next.config.js options detected')
      expect(output).toContain('badKey')
      expect(warningTimes).toBe(1)
    })
  }
)
