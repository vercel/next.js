import ansiEscapes from 'ansi-escapes'
import { join } from 'path'
import { check } from 'next-test-utils'
import { createNextApp, projectFilesShouldExist, useTempDir } from '../utils'

let testVersion
beforeAll(async () => {
  // TODO: investigate moving this post publish or create deployed
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'canary'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe('create-next-app prompts', () => {
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

  it('should prompt user to choose if --import-alias is not provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'choose-import-alias'

      /**
       * Start the create-next-app call.
       */
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-tailwind',
          '--eslint',
          '--no-src-dir',
          '--no-app',
        ],
        {
          cwd,
        },
        testVersion
      )
      /**
       * Bind the exit listener.
       */
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
        childProcess.stdin.write(ansiEscapes.cursorForward() + '\n')
        await check(() => output, /What import alias would you like configured/)
        childProcess.stdin.write('@/something/*\n')
      })

      /**
       * Verify it correctly emitted a TS project by looking for tsconfig.
       */
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

  it('should prompt user for choice if --tailwind is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'tw'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--eslint',
          '--no-src-dir',
          '--no-app',
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
})
