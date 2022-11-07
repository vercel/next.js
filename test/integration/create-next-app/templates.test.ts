/* eslint-env jest */
/**
 * @fileoverview
 *
 * This file contains tests for `create-next-app` templates, currently
 * JavaScript (default), TypeScript, and appDir.
 */

import {
  createNextApp,
  projectFilesShouldExist,
  shouldBeJavascriptProject,
  shouldBeTemplateProject,
  shouldBeTypescriptProject,
  spawnExitPromise,
} from './lib/utils'

import { useTempDir } from '../../../test/lib/use-temp-dir'

describe('create-next-app templates', () => {
  it('should prompt user to choose if --ts or --js is not provided', async () => {
    useTempDir(async (cwd) => {
      const projectName = 'choose-ts-js'

      /**
       * Start the create-next-app call.
       */
      const childProcess = createNextApp([projectName, '--eslint'], { cwd })
      /**
       * Wait for the prompt to display.
       */
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      /**
       * Bind the exit listener.
       */
      await new Promise<void>((resolve) => {
        childProcess.on('exit', (exitCode) => {
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
         * Simulate "Y" for TypeScript.
         */
        childProcess.stdin.write('N\n')
      })
    })
  })

  it('should create TS projects with --ts, --typescript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const childProcess = createNextApp([projectName, '--ts', '--eslint'], {
        cwd,
      })
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeTypescriptProject({ cwd, projectName, template: 'default' })
    })
  })

  it('should create TS projects with --ts, --typescript with CI=1', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const childProcess = createNextApp([projectName, '--ts', '--eslint'], {
        cwd,
        env: {
          ...process.env,
          CI: '1',
          GITHUB_ACTIONS: '1',
        },
      })
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeTypescriptProject({ cwd, projectName, template: 'default' })
    })
  })

  it('should create JS projects with --js, --javascript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const childProcess = createNextApp([projectName, '--js', '--eslint'], {
        cwd,
      })
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName, template: 'default' })
    })
  })
})

describe('create-next-app --experimental-app-dir', () => {
  it('should create TS appDir projects with --ts', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-test'
      const childProcess = createNextApp(
        [projectName, '--ts', '--experimental-app', '--eslint'],
        {
          cwd,
        }
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'ts' })
    })
  })

  it('should create JS appDir projects with --js', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-test'
      const childProcess = createNextApp(
        [projectName, '--js', '--experimental-app', '--eslint'],
        {
          cwd,
        }
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'js' })
    })
  })
})
