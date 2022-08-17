/* eslint-env jest */

import { resolve } from 'path'
import {
  createNextApp,
  projectDepsShouldBe,
  projectFilesShouldExist,
  projectFilesShouldntExist,
  spawnExitPromise,
} from './lib/utils'
import {
  allProjectFiles,
  jsProjectFiles,
  tsProjectFiles,
} from './lib/projectFiles'

import { useTempDir } from '../../../test/lib/use-temp-dir'

describe('create-next-app templates', () => {
  it('should prompt user to choose if --ts or --js is not provided', async () => {
    useTempDir(async (cwd) => {
      const projectName = 'choose-ts-js'
      const projectRoot = resolve(cwd, projectName)

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
        projectFilesShouldntExist(projectRoot, ['tsconfig.json'])
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
      const projectRoot = resolve(cwd, projectName)

      const childProcess = createNextApp([projectName, '--ts'], { cwd })
      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)

      projectFilesShouldntExist(projectRoot, jsProjectFiles)
      projectFilesShouldExist(projectRoot, [
        ...allProjectFiles,
        ...tsProjectFiles,
      ])

      projectDepsShouldBe(projectRoot, 'dependencies', [
        'next',
        'react',
        'react-dom',
      ])

      projectDepsShouldBe(projectRoot, 'devDependencies', [
        '@types/node',
        '@types/react',
        '@types/react-dom',
        'eslint',
        'eslint-config-next',
        'typescript',
      ])
    })
  })

  it('should create JS projects with --js, --javascript', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const projectRoot = resolve(cwd, projectName)

      const childProcess = createNextApp([projectName, '--js'], { cwd })
      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)

      projectFilesShouldntExist(projectRoot, tsProjectFiles)
      projectFilesShouldExist(projectRoot, [
        ...allProjectFiles,
        ...jsProjectFiles,
      ])

      projectDepsShouldBe(projectRoot, 'dependencies', [
        'next',
        'react',
        'react-dom',
      ])

      projectDepsShouldBe(projectRoot, 'devDependencies', [
        'eslint',
        'eslint-config-next',
      ])
    })
  })
})
