import { join } from 'path'
import { check } from 'next-test-utils'
import { createNextApp, projectFilesShouldExist, useTempDir } from './utils'

let testVersion
beforeAll(async () => {
  // TODO: investigate moving this post publish or create deployed GH#57025
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'canary'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe('create-next-app prompts', () => {
  it('should prompt user for choice if directory name is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-dir-name'
      const childProcess = createNextApp(
        [
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
        ],
        {
          cwd,
        }
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
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
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
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
        },
        testVersion
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tailwind.config.ts'],
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
          '--no-tailwind',
          '--no-src-dir',
        ],
        {
          cwd,
        },
        testVersion
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
})
