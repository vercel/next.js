import {
  command,
  EXAMPLE_PATH,
  projectFilesShouldExist,
  run,
  useTempDir,
} from './utils'

beforeEach(async () => {
  await command('yarn', ['--version'])
    // install yarn if not available
    .catch(() => command('corepack', ['prepare', '--activate', 'yarn@1.22.19']))
    .catch(() => command('npm', ['i', '-g', 'yarn']))
})

describe('create-next-app with package manager yarn', () => {
  it('should use yarn for --use-yarn flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'use-yarn'
      const res = await run(
        [
          projectName,
          '--js',
          '--app',
          '--eslint',
          '--use-yarn',
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
          'yarn.lock',
          'app/page.js',
          'node_modules/next',
        ],
      })
    })
  })
})

it('should use yarn when user-agent is yarn', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-yarn'
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
        npm_config_user_agent: 'yarn',
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
        'yarn.lock',
        'app/page.js',
        'node_modules/next',
      ],
    })
  })
})

it('should use yarn for --use-yarn flag with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'use-yarn-with-example'
    const res = await run(
      [projectName, '--use-yarn', '--example', EXAMPLE_PATH],
      { cwd }
    )

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'yarn.lock',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})

it('should use yarn when user-agent is yarn with example', async () => {
  await useTempDir(async (cwd) => {
    const projectName = 'user-agent-yarn-with-example'
    const res = await run([projectName, '--example', EXAMPLE_PATH], {
      cwd,
      npm_config_user_agent: 'yarn',
    })

    expect(res.exitCode).toBe(0)
    projectFilesShouldExist({
      cwd,
      projectName,
      files: [
        '.gitignore',
        'package.json',
        'yarn.lock',
        'app/page.tsx',
        'app/layout.tsx',
        'node_modules/next',
      ],
    })
  })
})
