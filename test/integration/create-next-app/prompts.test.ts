import { check } from 'next-test-utils'
import { join } from 'path'
import { createNextApp, projectFilesShouldExist, useTempDir } from './utils'

describe('create-next-app prompts', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

  it('should prompt user for choice if directory name is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-dir-name'
      const childProcess = createNextApp(
        [
          '--ts',
          '--app',
          '--eslint',
          '--no-turbopack',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['package.json'],
          })
          resolve()
        })

        // enter project name
        childProcess.stdin.write(`${projectName}\n`)
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
    })
  })

  it('should prompt user for choice if --js or --ts flag is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'ts-js'
      const childProcess = createNextApp(
        [
          projectName,
          '--app',
          '--eslint',
          '--no-turbopack',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tsconfig.json'],
          })
          resolve()
        })

        // select default choice: typescript
        childProcess.stdin.write('\n')
      })
    })
  })

  it('should prompt user for choice if --tailwind is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'tw'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-turbopack',
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['postcss.config.mjs'],
          })
          resolve()
        })

        // select default choice: tailwind
        childProcess.stdin.write('\n')
      })
    })
  })

  it('should prompt user for choice if --import-alias is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'import-alias'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-turbopack',
          '--no-tailwind',
          '--no-src-dir',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>(async (resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })
        // cursor forward, choose 'Yes' for custom import alias
        childProcess.stdin.write('\u001b[C\n')
        // used check here since it needs to wait for the prompt
        await check(() => output, /What import alias would you like configured/)
        childProcess.stdin.write('@/something/*\n')
      })

      const tsConfig = require(join(cwd, projectName, 'tsconfig.json'))
      expect(tsConfig.compilerOptions.paths).toMatchInlineSnapshot(`
        {
          "@/something/*": [
            "./*",
          ],
        }
      `)
    })
  })

  it('should not prompt user for choice and use defaults if --yes is defined', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'yes-we-can'
      const childProcess = createNextApp(
        [projectName, '--yes'],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              'app',
              'package.json',
              'postcss.config.mjs',
              'tsconfig.json',
            ],
          })
          resolve()
        })
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
      const tsConfig = require(join(cwd, projectName, 'tsconfig.json'))
      expect(tsConfig.compilerOptions.paths).toMatchInlineSnapshot(`
        {
          "@/*": [
            "./*",
          ],
        }
      `)
    })
  })

  it('should prompt user to confirm reset preferences', async () => {
    await useTempDir(async (cwd) => {
      const childProcess = createNextApp(
        ['--reset'],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>(async (resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })
        await check(
          () => output,
          /Would you like to reset the saved preferences/
        )
        // cursor forward, choose 'Yes' for reset preferences
        childProcess.stdin.write('\u001b[C\n')
        await check(
          () => output,
          /The preferences have been reset successfully/
        )
      })
    })
  })
})
