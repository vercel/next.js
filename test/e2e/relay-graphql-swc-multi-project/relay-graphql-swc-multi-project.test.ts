import { join } from 'path'
import { execFileSync } from 'child_process'
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

const relayCompilerPath = join(
  __dirname,
  '../../../node_modules/relay-compiler/cli.js'
)

describe('Relay Compiler Transform - Multi Project Config', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [relayCompilerPath], {
      cwd: __dirname,
      stdio: 'inherit',
    })
  })

  describe('project-a', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        'relay-runtime': '13.0.2',
        '@types/relay-runtime': '14.1.13',
        react: '19.3.0-canary-fef12a01-20260413',
        'react-dom': '19.3.0-canary-fef12a01-20260413',
      },
      buildCommand: 'pnpm next build project-a',
      startCommand: isNextDev
        ? `pnpm next dev project-a${shouldUseTurbopack() ? ' --turbopack' : ''}`
        : 'pnpm next start project-a',
    })

    it('should resolve index page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Project A')
      expect(html).toContain(`Hello, World!`)
    })
  })

  describe('project-b', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        'relay-runtime': '13.0.2',
        '@types/relay-runtime': '14.1.13',
        react: '19.3.0-canary-fef12a01-20260413',
        'react-dom': '19.3.0-canary-fef12a01-20260413',
      },
      buildCommand: 'pnpm next build project-b',
      startCommand: isNextDev
        ? `pnpm next dev project-b${shouldUseTurbopack() ? ' --turbopack' : ''}`
        : 'pnpm next start project-b',
    })

    it('should resolve index page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Project B')
      expect(html).toContain(`Hello, World!`)
    })
  })
})
