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
          '--no-react-compiler',
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
          '--no-react-compiler',
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
          '--no-react-compiler',
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
          '--no-react-compiler',
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

  it('should use recommended defaults when user selects that option', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'recommended-defaults'
      const childProcess = createNextApp(
        [projectName],
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
              'postcss.config.mjs', // tailwind
              'tsconfig.json', // typescript
            ],
          })
          resolve()
        })

        // Select "Yes, use recommended defaults" (default option, just press enter)
        childProcess.stdin.write('\n')
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
      // Verify webpack is not in dev script
      expect(pkg.scripts.dev).not.toContain('--webpack')
    })
  })

  it('should show reuse previous settings option when preferences exist', async () => {
    const Conf = require('next/dist/compiled/conf')

    await useTempDir(async (cwd) => {
      // Manually set preferences to simulate a previous run
      const conf = new Conf({ projectName: 'create-next-app' })
      conf.set('preferences', {
        typescript: false,
        eslint: true,
        linter: 'eslint',
        tailwind: false,
        app: false,
        srcDir: false,
        importAlias: '@/*',
        customizeImportAlias: false,
        turbopack: false,
        reactCompiler: false,
      })

      const projectName = 'reuse-prefs-project'
      const childProcess = createNextApp(
        [projectName],
        {
          cwd,
        },
        nextTgzFilename,
        false // Don't clear preferences
      )

      await new Promise<void>(async (resolve) => {
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        // Select "reuse previous settings" (cursor down once, then enter)
        childProcess.stdin.write('\u001b[B\n')

        // Wait for the prompt to appear with "reuse previous settings"
        await check(() => output, /No, reuse previous settings/)

        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              'pages', // pages router (not app)
              'package.json',
              'jsconfig.json', // javascript
            ],
          })
          resolve()
        })
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
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
