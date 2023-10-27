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
import Conf from 'next/dist/compiled/conf'
import { useTempDir } from '../../lib/use-temp-dir'
import { projectFilesShouldExist, shouldBeJavascriptProject } from './lib/utils'

const cli = require.resolve('create-next-app/dist/index.js')
const exampleRepo = 'https://github.com/vercel/next.js/tree/canary'
const examplePath = 'examples/basic-css'
const env = {
  ...process.env,
  COREPACK_ENABLE_STRICT: '0',
  NEXT_PRIVATE_TEST_VERSION: 'canary',
}

const run = (args: string[], options: execa.Options) => {
  const conf = new Conf({ projectName: 'create-next-app' })
  conf.clear()
  console.log(`Running "create-next-app ${args.join(' ')}"`)
  return execa('node', [cli].concat(args), {
    ...options,
    stdio: 'inherit',
    env: options.env || env,
  })
}

const command = (cmd: string, args: string[]) => {
  console.log(`Running command "${cmd} ${args.join(' ')}"`)
  return execa(cmd, args, {
    stdio: 'inherit',
    env,
  })
}

it('should use npm as the package manager on supplying --use-npm', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-npm',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env,
      }
    )

    expect(res.exitCode).toBe(0)
    shouldBeJavascriptProject({ cwd, projectName, template: 'app' })
  })
})

it('should use npm as the package manager on supplying --use-npm with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-npm',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env }
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

it('should use Yarn as the package manager on supplying --use-yarn', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-yarn'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-yarn',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env,
      }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        'package.json',
        'app/page.js',
        '.gitignore',
        '.eslintrc.json',
        'yarn.lock',
        'node_modules/next',
      ],
    })
  })
})

it('should use Yarn as the package manager on supplying --use-yarn with example', async () => {
  try {
    await command('yarn', ['--version'])
  } catch (_) {
    // install yarn if not available
    try {
      await command('corepack', ['prepare', '--activate', 'yarn@1.22.19'])
    } catch (_) {
      await command('npm', ['i', '-g', 'yarn'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'use-yarn'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-yarn',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        'package.json',
        'pages/index.tsx',
        '.gitignore',
        'yarn.lock',
        'node_modules/next',
      ],
    })
  })
})

it('should use pnpm as the package manager on supplying --use-pnpm', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-pnpm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-pnpm',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env,
      }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        'package.json',
        'app/page.js',
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
    await command('pnpm', ['--version'])
  } catch (_) {
    // install pnpm if not available
    try {
      await command('corepack', ['prepare', '--activate', 'pnpm@latest'])
    } catch (_) {
      await command('npm', ['i', '-g', 'pnpm'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'use-pnpm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-pnpm',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env }
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

it('should use Bun as the package manager on supplying --use-bun', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-bun'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-bun',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env,
      }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        'package.json',
        'app/page.js',
        '.gitignore',
        '.eslintrc.json',
        'bun.lockb',
        'node_modules/next',
      ],
    })
  })
})

it('should use Bun as the package manager on supplying --use-bun with example', async () => {
  try {
    await command('bun', ['--version'])
  } catch (_) {
    // install Bun if not available
    await command('npm', ['i', '-g', 'bun'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'use-bun'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--use-bun',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        'package.json',
        'pages/index.tsx',
        '.gitignore',
        'bun.lockb',
        'node_modules/next',
      ],
    })
  })
})

it('should infer npm as the package manager', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env: { ...env, npm_config_user_agent: 'npm' },
      }
    )

    const files = [
      'package.json',
      'app/page.js',
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
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env: { ...env, npm_config_user_agent: 'npm' } }
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
    await command('yarn', ['--version'])
  } catch (_) {
    // install yarn if not available
    try {
      await command('corepack', ['prepare', '--activate', 'yarn@1.22.19'])
    } catch (_) {
      await command('npm', ['i', '-g', 'yarn'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-yarn'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env: { ...env, npm_config_user_agent: 'yarn' },
      }
    )

    const files = [
      'package.json',
      'app/page.js',
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
    await command('yarn', ['--version'])
  } catch (_) {
    // install yarn if not available
    try {
      await command('corepack', ['prepare', '--activate', 'yarn@1.22.19'])
    } catch (_) {
      await command('npm', ['i', '-g', 'yarn'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env: { ...env, npm_config_user_agent: 'yarn' } }
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
    await command('pnpm', ['--version'])
  } catch (_) {
    // install pnpm if not available
    try {
      await command('corepack', ['prepare', '--activate', 'pnpm@latest'])
    } catch (_) {
      await command('npm', ['i', '-g', 'pnpm'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env: { ...env, npm_config_user_agent: 'pnpm' },
      }
    )

    const files = [
      'package.json',
      'app/page.js',
      '.gitignore',
      '.eslintrc.json',
      'pnpm-lock.yaml',
      'node_modules/next',
    ]

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({ cwd, projectName, files })
  })
})

it('should infer pnpm as the package manager with example', async () => {
  try {
    await command('pnpm', ['--version'])
  } catch (_) {
    // install pnpm if not available
    try {
      await command('corepack', ['prepare', '--activate', 'pnpm@latest'])
    } catch (_) {
      await command('npm', ['i', '-g', 'pnpm'])
    }
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env: { ...env, npm_config_user_agent: 'pnpm' } }
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

it('should infer Bun as the package manager', async () => {
  try {
    await command('bun', ['--version'])
  } catch (_) {
    // install Bun if not available
    await command('npm', ['i', '-g', 'bun'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--no-src-dir',
        '--app',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        env: { ...env, npm_config_user_agent: 'bun' },
      }
    )

    const files = [
      'package.json',
      'app/page.js',
      '.gitignore',
      '.eslintrc.json',
      'bun.lockb',
      'node_modules/next',
    ]

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({ cwd, projectName, files })
  })
})

it('should infer Bun as the package manager with example', async () => {
  try {
    await command('bun', ['--version'])
  } catch (_) {
    // install Bun if not available
    await command('npm', ['i', '-g', 'bun'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'infer-package-manager-npm'
    const res = await run(
      [
        projectName,
        '--js',
        '--no-tailwind',
        '--eslint',
        '--example',
        `${exampleRepo}/${examplePath}`,
      ],
      { cwd, env: { ...env, npm_config_user_agent: 'bun' } }
    )

    const files = [
      'package.json',
      'pages/index.tsx',
      '.gitignore',
      'bun.lockb',
      'node_modules/next',
    ]

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({ cwd, projectName, files })
  })
})
