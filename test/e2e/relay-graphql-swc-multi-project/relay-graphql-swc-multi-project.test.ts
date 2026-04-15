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
      },
      buildCommand: 'pnpm --dir project-a exec next build',
      startCommand: isNextDev
        ? `pnpm --dir project-a exec next dev${
            shouldUseTurbopack() ? ' --turbopack' : ''
          }`
        : 'pnpm --dir project-a exec next start',
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
      },
      buildCommand: 'pnpm --dir project-b exec next build',
      startCommand: isNextDev
        ? `pnpm --dir project-b exec next dev${
            shouldUseTurbopack() ? ' --turbopack' : ''
          }`
        : 'pnpm --dir project-b exec next start',
    })

    it('should resolve index page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Project B')
      expect(html).toContain(`Hello, World!`)
    })
  })
})
