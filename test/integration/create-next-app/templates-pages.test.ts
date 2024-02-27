/* eslint-env jest */
/**
 * @fileoverview
 *
 * This file contains tests for `create-next-app` templates, currently
 * JavaScript (default), TypeScript, and appDir.
 */

import path from 'path'
import fs from 'fs-extra'
import {
  createNextApp,
  projectFilesShouldExist,
  shouldBeJavascriptProject,
  shouldBeTypescriptProject,
  spawnExitPromise,
} from './lib/utils'
//import { Span } from 'next/dist/trace'

import { useTempDir } from '../../lib/use-temp-dir'
import {
  check,
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
} from 'next-test-utils'
import resolveFrom from 'resolve-from'
//import { createNextInstall } from '../../lib/create-next-install'
import ansiEscapes from 'ansi-escapes'

const startsWithoutError = async (
  appDir: string,
  modes = ['default', 'turbo'],
  usingAppDirectory: boolean = false
) => {
  for (const mode of modes) {
    appDir = await fs.realpath(appDir)
    const appPort = await findPort()
    const app = await launchApp(appDir, appPort, {
      turbo: mode === 'turbo',
      cwd: appDir,
      nextBin: resolveFrom(appDir, 'next/dist/bin/next'),
    })

    try {
      const res = await fetchViaHTTP(appPort, '/')
      expect(await res.text()).toContain('Get started by editing')
      expect(res.status).toBe(200)

      if (!usingAppDirectory) {
        const apiRes = await fetchViaHTTP(appPort, '/api/hello')
        expect(await apiRes.json()).toEqual({ name: 'John Doe' })
        expect(apiRes.status).toBe(200)
      }
    } finally {
      await killApp(app)
    }
  }
}
let testVersion

describe('create-next-app templates', () => {
  beforeAll(async () => {
    // TODO: investigate moving this post publish or create deployed
    // tarballs to avoid these failing while a publish is in progress
    testVersion = 'canary'
    // const span = new Span({ name: 'parent' })
    // testVersion = (
    //   await createNextInstall({ onlyPackages: true, parentSpan: span })
    // ).get('next')
  })

  it('should prompt user to choose if --ts or --js is not provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'choose-ts-js'

      /**
       * Start the create-next-app call.
       */
      const childProcess = createNextApp(
        [
          projectName,
          '--no-tailwind',
          '--eslint',
          '--no-src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      /**
       * Wait for the prompt to display.
       */
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      /**
       * Bind the exit listener.
       */
      await new Promise<void>((resolve, reject) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          /**
           * Verify it correctly emitted a TS project by looking for tsconfig.
           */
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tsconfig.json'],
          })
          resolve()
        })
        /**
         * Simulate "N" for TypeScript.
         */
        childProcess.stdin.write('N\n')
      })
    })
  })

  it('should create TS projects with --ts, --typescript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-tailwind',
          '--eslint',
          '--no-src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeTypescriptProject({ cwd, projectName, template: 'default' })

      await startsWithoutError(path.join(cwd, projectName))
    })
  })

  it('should create TS projects with --ts, --typescript --src-dir', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-tailwind',
          '--eslint',
          '--src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeTypescriptProject({
        cwd,
        projectName,
        template: 'default',
        srcDir: true,
      })
      await startsWithoutError(path.join(cwd, projectName))
    })
  })

  it('should create JS projects with --js, --javascript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--eslint',
          '--no-src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName, template: 'default' })
      await startsWithoutError(path.join(cwd, projectName), [
        'default',
        'turbo',
      ])
    })
  })

  it('should create JS projects with --js, --javascript --src-dir', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--eslint',
          '--src-dir',
          '--no-app',
          `--no-import-alias`,
        ],
        {
          cwd,
        },
        testVersion
      )
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeJavascriptProject({
        cwd,
        projectName,
        template: 'default',
        srcDir: true,
      })
      await startsWithoutError(path.join(cwd, projectName), [
        'default',
        'turbo',
      ])
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
      const tsConfig = require(path.join(cwd, projectName, 'tsconfig.json'))
      expect(tsConfig.compilerOptions.paths).toMatchInlineSnapshot(`
        {
          "@/something/*": [
            "./*",
          ],
        }
      `)
    })
  })

  it('should work with --tailwind and --src together', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'tailwind-js-src'

      /**
       * Start the create-next-app call.
       */
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-eslint',
          '--tailwind',
          '--src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      /**
       * Wait for the prompt to display.
       */
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      /**
       * Bind the exit listener.
       */
      await new Promise<void>((resolve, reject) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          /**
           * Verify it correctly emitted a Tailwind project by looking for tailwind.config.js.
           */
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tailwind.config.js'],
          })
          resolve()
        })
        /**
         * Simulate "N" for Tailwind.
         */
        childProcess.stdin.write('N\n')
      })
    })
  })

  it('should prompt user to choose if --tailwind or --no-tailwind is not provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'choose-tailwind'

      /**
       * Start the create-next-app call.
       */
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--eslint',
          '--no-src-dir',
          '--no-app',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )
      /**
       * Wait for the prompt to display.
       */
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      /**
       * Bind the exit listener.
       */
      await new Promise<void>((resolve, reject) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          /**
           * Verify it correctly emitted a Tailwind project by looking for tailwind.config.js.
           */
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tailwind.config.js'],
          })
          resolve()
        })
        /**
         * Simulate "N" for Tailwind.
         */
        childProcess.stdin.write('N\n')
      })
    })
  })
})
