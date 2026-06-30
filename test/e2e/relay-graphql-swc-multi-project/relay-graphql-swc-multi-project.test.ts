import {
  nextTestSetup,
  isNextDev,
  isNextDeploy,
  type NextInstance,
} from 'e2e-utils'
import execa from 'execa'
import { shouldUseTurbopack } from 'next-test-utils'

function relayCompilerValidate(next: NextInstance) {
  ;(isNextDeploy ? it.skip : it)('has up-to-date graphql types', async () => {
    await execa('pnpm', ['exec', 'relay-compiler', '--validate'], {
      cwd: next.testDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
  })
}

describe('Relay Compiler Transform - Multi Project Config', () => {
  describe('project-a', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        'relay-compiler': '21.0.1',
        'relay-runtime': '21.0.1',
        '@types/relay-runtime': '20.1.1',
        react: '19.3.0-canary-fef12a01-20260413',
        'react-dom': '19.3.0-canary-fef12a01-20260413',
      },
      // The relay SWC transform uses `process.cwd()` as its root, so the
      // Next.js process must run with its working directory set to the
      // sub-project. We do that here by wrapping the command in a shell
      // script defined via `packageJson.scripts`, which `pnpm run` executes
      // via a shell so `cd` works.
      packageJson: {
        scripts: {
          'build-project-a': 'cd project-a && next build',
          'dev-project-a': `cd project-a && next dev${shouldUseTurbopack() ? ' --turbopack' : ''}`,
          'start-project-a': 'cd project-a && next start',
        },
      },
      buildCommand: 'pnpm run build-project-a',
      startCommand: isNextDev
        ? 'pnpm run dev-project-a'
        : 'pnpm run start-project-a',
      // Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
      skipDeployment: true,
    })

    relayCompilerValidate(next)

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
        'relay-compiler': '21.0.1',
        'relay-runtime': '21.0.1',
        '@types/relay-runtime': '20.1.1',
        react: '19.3.0-canary-fef12a01-20260413',
        'react-dom': '19.3.0-canary-fef12a01-20260413',
      },
      packageJson: {
        scripts: {
          'build-project-b': 'cd project-b && next build',
          'dev-project-b': `cd project-b && next dev${shouldUseTurbopack() ? ' --turbopack' : ''}`,
          'start-project-b': 'cd project-b && next start',
        },
      },
      buildCommand: 'pnpm run build-project-b',
      startCommand: isNextDev
        ? 'pnpm run dev-project-b'
        : 'pnpm run start-project-b',
      // Vercel deployment fails to build/deploy this fixture in CI; skip in deploy mode.
      skipDeployment: true,
    })

    relayCompilerValidate(next)

    it('should resolve index page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Project B')
      expect(html).toContain(`Hello, World!`)
    })
  })
})
