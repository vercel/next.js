/* eslint-env jest */

import { resolve } from 'path'
import {
  createNextApp,
  projectFilesShouldNotExist,
  shouldBeJavascriptProject,
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
      const childProcess = createNextApp([projectName], { cwd })
      /**
       * Wait for the prompt to display.
       */
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      /**
       * Bind the exit listener.
       */
      childProcess.on('exit', (exitCode) => {
        expect(exitCode).toBe(0)
        /**
         * Verify it correctly emitted a TS project by looking for tsconfig.
         */
        projectFilesShouldNotExist({
          cwd,
          projectName,
          files: ['tsconfig.json'],
        })
      })
      /**
       * Simulate "Y" for TypeScript.
       */
      childProcess.stdin.write('N\n')
    })
  })

  it('should create TS projects with --ts, --typescript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const childProcess = createNextApp([projectName, '--ts'], { cwd })
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeTypescriptProject({ cwd, projectName })
    })
  })

  it('should create JS projects with --js, --javascript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const childProcess = createNextApp([projectName, '--js'], { cwd })
      const exitCode = await spawnExitPromise(childProcess)

      expect(exitCode).toBe(0)
      shouldBeJavascriptProject({ cwd, projectName })
    })
  })
})
