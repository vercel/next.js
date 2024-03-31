import {
  command,
  EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from './utils'

beforeEach(async () => {
  await command('pnpm', ['--version'])
    // install pnpm if not available
    .catch(() => command('corepack', ['prepare', '--activate', 'pnpm@latest']))
    .catch(() => command('npm', ['i', '-g', 'pnpm']))
})

describe('create-next-app with package manager pnpm', () => {
  it('should use pnpm for --use-pnpm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-pnpm'
      const res = await run(
        [
          projectName,
          '--js',
          '--app',
          '--eslint',
          '--use-pnpm',
          '--no-src-dir',
          '--no-tailwind',
          `--import-alias=@/*`,
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
          '.eslintrc.json',
          '.gitignore',
          'package.json',
          'pnpm-lock.yaml',
          'app/page.js',
          'node_modules/next',
        ],
      })
    })
  })
})

it('should use pnpm when user-agent is pnpm', async () => {
  try {
    await command('pnpm', ['--version'])
  } catch (_) {
    // install pnpm if not available
    await command('npm', ['i', '-g', 'pnpm'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-pnpm'
    const res = await run(
      [
        projectName,
        '--js',
        '--app',
        '--eslint',
        '--no-src-dir',
        '--no-tailwind',
        `--import-alias=@/*`,
      ],
      {
        cwd,
        npm_config_user_agent: 'pnpm',
      }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.eslintrc.json',
        '.gitignore',
        'package.json',
        'pnpm-lock.yaml',
        'app/page.js',
        'node_modules/next',
      ],
    })
  })
})

it('should use pnpm for --use-pnpm flag with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-pnpm-with-example'
    const res = await run(
      [projectName, '--use-pnpm', '--example', EXAMPLE_PATH],
      { cwd }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'pnpm-lock.yaml',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})

it('should use pnpm when user-agent is pnpm with example', async () => {
  try {
    await command('pnpm', ['--version'])
  } catch {
    // install pnpm if not available
    await command('npm', ['i', '-g', 'pnpm'])
  }

  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-pnpm-with-example'
    const res = await run([projectName, '--example', EXAMPLE_PATH], {
      cwd,
      npm_config_user_agent: 'pnpm',
    })

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'pnpm-lock.yaml',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})
