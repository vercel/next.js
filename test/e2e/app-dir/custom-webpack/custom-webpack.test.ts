import { promises as fs } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const webpackVersions = ['5.98.0', '5.111.0']

for (const webpackVersion of webpackVersions) {
  // @force-gate webpack
  describe(`--custom-webpack with webpack ${webpackVersion}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        webpack: webpackVersion,
      },
      env: {
        EXPECTED_WEBPACK_VERSION: webpackVersion,
      },
      buildCommand: 'pnpm next build --custom-webpack',
      startCommand: isNextDev
        ? 'pnpm next dev --custom-webpack'
        : 'pnpm next start',
    })

    it('uses project webpack during config evaluation and compilation', async () => {
      const $ = await next.render$('/')
      expect($('#webpack-version').text()).toBe(
        `custom plugin with webpack ${webpackVersion}`
      )
      expect($('#replacement-message').text()).toBe(
        'replaced by NormalModuleReplacementPlugin'
      )
    })
  })
}

// @force-gate webpack
describe('--custom-webpack with a shadowed webpack and no pnpm hoisting', () => {
  const webpackVersion = '5.111.0'
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'pnpm-workspace.yaml': 'hoistPattern: []\n',
    },
    dependencies: {
      webpack: webpackVersion,
      'webpack-old': 'npm:webpack@5.98.0',
    },
    env: {
      EXPECTED_WEBPACK_VERSION: webpackVersion,
    },
    buildCommand: 'pnpm next build --custom-webpack',
    startCommand: isNextDev
      ? 'pnpm next dev --custom-webpack'
      : 'pnpm next start',
    skipStart: true,
  })

  it('uses the project webpack, not the one next would resolve', async () => {
    if (isNextDeploy) {
      // Deployed builds cannot shadow the installed Next.js package locally.
      // Still verify the deployed build uses the application's webpack.
      await next.start()
      const $ = await next.render$('/')
      expect($('#webpack-version').text()).toBe(
        `custom plugin with webpack ${webpackVersion}`
      )
      return
    }

    if (process.env.NEXT_SKIP_ISOLATE) {
      // The non-isolated Next.js package is the checkout itself, so shadowing
      // its node_modules would modify the developer's workspace. Check the
      // project-scoped loader using the workspace webpack instead.
      const result = await next.runCommand(['build', '--custom-webpack'], {
        env: { EXPECTED_WEBPACK_VERSION: '5.98.0' },
      })
      expect(result.exitCode).toBe(0)
      return
    }

    const nextPackageDir = path.dirname(
      require.resolve('next/package.json', { paths: [next.testDir] })
    )
    const shadowPath = path.join(nextPackageDir, 'node_modules', 'webpack')
    await fs.mkdir(path.dirname(shadowPath), { recursive: true })
    await fs.symlink(
      await fs.realpath(path.join(next.testDir, 'node_modules', 'webpack-old')),
      shadowPath,
      'junction'
    )

    const wrapperRequire = createRequire(
      path.join(nextPackageDir, 'dist/compiled/webpack/webpack.js')
    )
    const projectRequire = createRequire(
      path.join(next.testDir, 'package.json')
    )
    expect(projectRequire('webpack/package.json').version).toBe(webpackVersion)
    expect(wrapperRequire('webpack/package.json').version).toBe('5.98.0')

    await next.start()
    const $ = await next.render$('/')
    expect($('#webpack-version').text()).toBe(
      `custom plugin with webpack ${webpackVersion}`
    )
    expect($('#replacement-message').text()).toBe(
      'replaced by NormalModuleReplacementPlugin'
    )
  })
})

// @force-gate webpack
describe('--custom-webpack with an explicit application directory', () => {
  const webpackVersion = '5.111.0'
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { webpack: webpackVersion },
    env: { EXPECTED_WEBPACK_VERSION: webpackVersion },
    buildCommand: 'pnpm next build --custom-webpack',
    startCommand: isNextDev
      ? 'pnpm next dev --custom-webpack'
      : 'pnpm next start',
    skipStart: true,
  })

  it('resolves webpack from the application, not the working directory', async () => {
    if (isNextDeploy) {
      // There is no local CLI process or working directory in a deployment.
      // Verify the deployed build still uses the application's webpack.
      await next.start()
      const $ = await next.render$('/')
      expect($('#webpack-version').text()).toBe(
        `custom plugin with webpack ${webpackVersion}`
      )
      return
    }

    const result = await next.runCommand(
      ['build', next.testDir, '--custom-webpack'],
      {
        cwd: path.dirname(next.testDir),
        env: process.env.NEXT_SKIP_ISOLATE
          ? { EXPECTED_WEBPACK_VERSION: '5.98.0' }
          : undefined,
      }
    )
    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).toContain('Compiled successfully')
  })
})

// @force-gate webpack
describe('--custom-webpack without a webpack dependency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
    buildCommand: 'pnpm next build --custom-webpack',
    startCommand: isNextDev
      ? 'pnpm next dev --custom-webpack'
      : 'pnpm next start',
    skipStart: true,
  })

  it('reports how to install webpack', async () => {
    await next.start().catch(() => {})
    await retry(() => {
      expect(next.cliOutput).toContain(
        '`--custom-webpack` requires webpack to be installed in your project'
      )
    })
  })
})

// @force-gate webpack
describe('--webpack without a webpack dependency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {},
    buildCommand: 'pnpm next build --webpack',
    startCommand: isNextDev ? 'pnpm next dev --webpack' : 'pnpm next start',
  })

  it('uses bundled webpack without requiring a project webpack installation', async () => {
    const html = await next.render('/')
    expect(html).toContain('original module')
  })
})

for (const conflictingFlag of ['--webpack', '--turbopack']) {
  // @force-gate webpack
  describe(`--custom-webpack with ${conflictingFlag}`, () => {
    const command = `pnpm next ${isNextDev ? 'dev' : 'build'} --custom-webpack ${conflictingFlag}`
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {},
      buildCommand: command,
      startCommand: command,
      skipStart: true,
    })

    it('reports conflicting bundler flags', async () => {
      await next.start().catch(() => {})
      await retry(() => {
        expect(next.cliOutput).toContain('Multiple bundler flags set:')
        expect(next.cliOutput).toContain('--custom-webpack')
        expect(next.cliOutput).toContain(conflictingFlag)
      })
    })
  })
}
