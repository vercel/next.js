/* eslint-env jest */
/**
 * @fileoverview
 *
 * This file contains integration tests for `create-next-app`. It currently
 * aliases all calls to `--js`.
 *
 * TypeScript project creation via `create-next-app --ts` is tested in
 * `./templates.test.ts`, though additional tests can be added here using the
 * `shouldBeTypescriptProject` helper.
 */

import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'

import { useTempDir } from '../../lib/use-temp-dir'
import {
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  shouldBeJavascriptProject,
} from './lib/utils'

const cli = require.resolve('create-next-app/dist/index.js')
const exampleRepo = 'https://github.com/vercel/next.js/tree/canary'
const examplePath = 'examples/basic-css'

const run = (args: string[], options: execa.Options) =>
  execa('node', [cli].concat(args), options)

describe('create next app', () => {
  it('non-empty directory', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'non-empty-directory'
      await fs.mkdirp(path.join(cwd, projectName))
      const pkg = path.join(cwd, projectName, 'package.json')
      fs.writeFileSync(pkg, '{ "foo": "bar" }')

      const res = await run([projectName, '--js'], { cwd, reject: false })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toMatch(/contains files that could conflict/)
    })
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('empty directory', async () => {
      await useTempDir(async (cwd) => {
        const projectName = 'empty-directory'
        const res = await run([projectName, '--js'], { cwd })

        expect(res.exitCode).toBe(0)
        shouldBeJavascriptProject({ cwd, projectName })
      })
    })
  }

  it('invalid example name', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'invalid-example-name'
      const res = await run(
        [projectName, '--js', '--example', 'not a real example'],
        {
          cwd,
          reject: false,
        }
      )

      expect(res.exitCode).toBe(1)
      projectFilesShouldNotExist({
        cwd,
        projectName,
        files: ['package.json'],
      })
    })
  })

  it('valid example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'valid-example'
      const res = await run([projectName, '--js', '--example', 'basic-css'], {
        cwd,
      })
      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'node_modules/next',
        ],
      })
    })
  })

  it('valid example without package.json', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'valid-example-without-package-json'
      const res = await run(
        [projectName, '--js', '--example', 'with-docker-compose'],
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['.dockerignore', '.gitignore'],
      })
    })
  })

  it('should allow example with GitHub URL', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-app'
      const res = await run(
        [projectName, '--js', '--example', `${exampleRepo}/${examplePath}`],
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'node_modules/next',
        ],
      })
    })
  })

  it('should allow example with GitHub URL with trailing slash', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-app'
      const res = await run(
        [
          projectName,
          '--js',
          '--example',
          'https://github.com/vercel/nextjs-portfolio-starter/',
        ],
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.mdx',
          '.gitignore',
          'node_modules/next',
        ],
      })
    })
  })

  it('should allow example with GitHub URL and example-path', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-example-path'
      const res = await run(
        [
          projectName,
          '--js',
          '--example',
          exampleRepo,
          '--example-path',
          examplePath,
        ],
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'node_modules/react',
        ],
      })
    })
  })

  it('should use --example-path over the file path in the GitHub URL', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-example-path-2'
      const res = await run(
        [
          projectName,
          '--js',
          '--example',
          `${exampleRepo}/${examplePath}`,
          '--example-path',
          examplePath,
        ],
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'node_modules/react',
        ],
      })
    })
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('should fall back to default template', async () => {
      await useTempDir(async (cwd) => {
        const projectName = 'fail-example'
        const res = await run(
          [projectName, '--js', '--example', '__internal-testing-retry'],
          {
            cwd,
            input: '\n',
          }
        )

        expect(res.exitCode).toBe(0)
        shouldBeJavascriptProject({ cwd, projectName })
      })
    })
  }

  it('should allow an example named default', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'default-example'
      const res = await run([projectName, '--js', '--example', 'default'], {
        cwd,
      })

      expect(res.exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName })
    })
  })

  it('should exit if example flag is empty', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-example-provided'
      const res = await run([projectName, '--js', '--example'], {
        cwd,
        reject: false,
      })

      expect(res.exitCode).toBe(1)
    })
  })

  it('should exit if the folder is not writable', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'not-writable'
      const res = await run([projectName, '--js'], { cwd, reject: false })

      if (process.platform === 'win32') {
        expect(res.exitCode).toBe(0)
        const files = ['package.json']
        projectFilesShouldExist({ cwd, projectName, files })
        return
      }

      expect(res.exitCode).toBe(1)
      expect(res.stderr).toMatch(
        /you do not have write permissions for this folder/
      )
    }, 0o500)
  })

  it('should create a project in the current directory', async () => {
    await useTempDir(async (cwd) => {
      const env = { ...process.env }
      const tmpBin = path.join(__dirname, 'bin')
      const tmpYarn = path.join(tmpBin, 'yarn')

      if (process.platform !== 'win32') {
        // ensure install succeeds with invalid yarn binary
        // which simulates no yarn binary being available as
        // an alternative to removing the binary and reinstalling
        await fs.remove(tmpBin)
        await fs.mkdir(tmpBin)
        await fs.writeFile(tmpYarn, '#!/bin/sh\nexit 1')
        await fs.chmod(tmpYarn, '755')
        env.PATH = `${tmpBin}:${env.PATH}`
        delete env.npm_config_user_agent
      }

      const res = await run(['.', '--js'], {
        cwd,
        env,
        extendEnv: false,
        stdio: 'inherit',
      })
      await fs.remove(tmpBin)

      expect(res.exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName: '.' })
    })
  })

  it('should ask the user for a name for the project if none supplied', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-project'
      const res = await run(['--js'], { cwd, input: `${projectName}\n` })

      expect(res.exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName })
    })
  })

  it('should use npm as the package manager on supplying --use-npm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run([projectName, '--js', '--use-npm'], { cwd })

      expect(res.exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName })
    })
  })

  it('should use npm as the package manager on supplying --use-npm with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run(
        [
          projectName,
          '--js',
          '--use-npm',
          '--example',
          `${exampleRepo}/${examplePath}`,
        ],
        { cwd }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'package-lock.json',
          'node_modules/next',
        ],
      })
    })
  })

  it('should use pnpm as the package manager on supplying --use-pnpm', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run([projectName, '--js', '--use-pnpm'], { cwd })

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.js',
          '.gitignore',
          '.eslintrc.json',
          'pnpm-lock.yaml',
          'node_modules/next',
        ],
      })
    })
  })

  it('should use pnpm as the package manager on supplying --use-pnpm with example', async () => {
    try {
      await execa('pnpm', ['--version'])
    } catch (_) {
      // install pnpm if not available
      await execa('npm', ['i', '-g', 'pnpm'])
    }

    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run(
        [
          projectName,
          '--js',
          '--use-pnpm',
          '--example',
          `${exampleRepo}/${examplePath}`,
        ],
        { cwd }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          'package.json',
          'pages/index.tsx',
          '.gitignore',
          'pnpm-lock.yaml',
          'node_modules/next',
        ],
      })
    })
  })

  it('should infer npm as the package manager', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'infer-package-manager-npm'
      const res = await run([projectName, '--js'], {
        cwd,
        env: { ...process.env, npm_config_user_agent: 'npm' },
      })

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        '.eslintrc.json',
        'package-lock.json',
        'node_modules/next',
      ]

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({ cwd, projectName, files })
    })
  })

  it('should infer npm as the package manager with example', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'infer-package-manager-npm'
      const res = await run(
        [projectName, '--js', '--example', `${exampleRepo}/${examplePath}`],
        { cwd, env: { ...process.env, npm_config_user_agent: 'npm' } }
      )

      const files = [
        'package.json',
        'pages/index.tsx',
        '.gitignore',
        'package-lock.json',
        'node_modules/next',
      ]

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({ cwd, projectName, files })
    })
  })

  it('should infer yarn as the package manager', async () => {
    try {
      await execa('yarn', ['--version'])
    } catch (_) {
      // install yarn if not available
      await execa('npm', ['i', '-g', 'yarn'])
    }

    await useTempDir(async (cwd) => {
      const projectName = 'infer-package-manager-yarn'
      const res = await run([projectName, '--js'], {
        cwd,
        env: { ...process.env, npm_config_user_agent: 'yarn' },
      })

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        '.eslintrc.json',
        'yarn.lock',
        'node_modules/next',
      ]

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({ cwd, projectName, files })
    })
  })

  it('should infer yarn as the package manager with example', async () => {
    try {
      await execa('yarn', ['--version'])
    } catch (_) {
      // install yarn if not available
      await execa('npm', ['i', '-g', 'yarn'])
    }

    await useTempDir(async (cwd) => {
      const projectName = 'infer-package-manager-npm'
      const res = await run(
        [projectName, '--js', '--example', `${exampleRepo}/${examplePath}`],
        { cwd, env: { ...process.env, npm_config_user_agent: 'yarn' } }
      )

      const files = [
        'package.json',
        'pages/index.tsx',
        '.gitignore',
        'yarn.lock',
        'node_modules/next',
      ]

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({ cwd, projectName, files })
    })
  })

  it('should infer pnpm as the package manager', async () => {
    try {
      await execa('pnpm', ['--version'])
    } catch (_) {
      // install pnpm if not available
      await execa('npm', ['i', '-g', 'pnpm'])
    }

    await useTempDir(async (cwd) => {
      const projectName = 'infer-package-manager'
      const res = await run([projectName, '--js'], {
        cwd,
        env: { ...process.env, npm_config_user_agent: 'pnpm' },
      })

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        '.eslintrc.json',
        'pnpm-lock.yaml',
        'node_modules/next',
      ]

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({ cwd, projectName, files })
    })
  })
})

it('should infer pnpm as the package manager with example', async () => {
  try {
    await execa('pnpm', ['--version'])
  } catch (_) {
    // install pnpm if not available
    await execa('npm', ['i', '-g', 'pnpm'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-npm'
    const res = await run(
      [projectName, '--js', '--example', `${exampleRepo}/${examplePath}`],
      { cwd, env: { ...process.env, npm_config_user_agent: 'pnpm' } }
    )

    const files = [
      'package.json',
      'pages/index.tsx',
      '.gitignore',
      'pnpm-lock.yaml',
      'node_modules/next',
    ]

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({ cwd, projectName, files })
  })
})
