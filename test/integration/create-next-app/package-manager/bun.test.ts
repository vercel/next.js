import {
  command,
  EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from './utils'

beforeEach(async () => {
  await command('bun', ['--version'])
    // install bun if not available
    .catch(() => command('npm', ['i', '-g', 'bun']))
})

describe('create-next-app with package manager bun', () => {
  it('should use bun for --use-bun flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-bun'
      const res = await run(
        [
          projectName,
          '--js',
          '--app',
          '--eslint',
          '--use-bun',
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
          'bun.lockb',
          'package.json',
          'app/page.js',
          'node_modules/next',
        ],
      })
    })
  })
})

it('should use bun when user-agent is bun', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-bun'
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
        npm_config_user_agent: 'bun',
      }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.eslintrc.json',
        '.gitignore',
        'bun.lockb',
        'package.json',
        'app/page.js',
        'node_modules/next',
      ],
    })
  })
})

it('should use bun for --use-bun flag with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-bun-with-example'
    const res = await run(
      [projectName, '--use-bun', '--example', EXAMPLE_PATH],
      { cwd }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'bun.lockb',
        'package.json',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})

it('should use bun when user-agent is bun with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-bun-with-example'
    const res = await run([projectName, '--example', EXAMPLE_PATH], {
      cwd,
      npm_config_user_agent: 'bun',
    })

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'bun.lockb',
        'package.json',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})
