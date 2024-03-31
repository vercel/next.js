import { EXAMPLE_PATH, projectFilesShouldExist, run, useTempDir } from './utils'

describe('create-next-app with package manager npm', () => {
  it('should use npm for --use-npm flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run(
        [
          projectName,
          '--js',
          '--app',
          '--eslint',
          '--use-npm',
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
          'package-lock.json',
          'app/page.js',
          'node_modules/next',
        ],
      })
    })
  })
})

it('should use npm when user-agent is npm', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-npm'
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
        npm_config_user_agent: 'npm',
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
        'package-lock.json',
        'app/page.js',
        'node_modules/next',
      ],
    })
  })
})

it('should use npm for --use-npm flag with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-npm-with-example'
    const res = await run(
      [projectName, '--use-npm', '--example', EXAMPLE_PATH],
      { cwd }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'package-lock.json',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})

it('should use npm when user-agent is npm with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-npm-with-example'
    const res = await run([projectName, '--example', EXAMPLE_PATH], {
      cwd,
      npm_config_user_agent: 'npm',
    })

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'package-lock.json',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})
