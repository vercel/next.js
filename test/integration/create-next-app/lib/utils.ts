/**
 * @fileoverview
 *
 * This file contains utilities for  `create-next-app` testing.
 */

import { ChildProcess, spawn, SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

const cli = require.resolve('create-next-app/dist/index.js')

/**
 * Run the built version of `create-next-app` with the given arguments.
 */
export const createNextApp = (args: string[], options?: SpawnOptions) => {
  console.log(`[TEST] $ ${cli} ${args.join(' ')}`, { options })
  return spawn('node', [cli].concat(args), options ?? {})
}

/**
 * Return a Promise that resolves when the process exits with code 0 and rejects
 * otherwise.
 */
export const spawnExitPromise = (childProcess: ChildProcess) => {
  return new Promise((resolve, reject) => {
    childProcess
      .on('exit', (code) => {
        if (code === 0) {
          resolve(code)
        } else {
          reject(code)
        }
      })
      .on('error', reject)
  })
}

export const projectFilesShouldExist = (
  projectRoot: string,
  files: string[]
) => {
  for (const file of files) {
    expect(existsSync(resolve(projectRoot, file))).toBe(true)
  }
}

export const projectFilesShouldntExist = (
  projectRoot: string,
  files: string[]
) => {
  for (const file of files) {
    expect(existsSync(resolve(projectRoot, file))).toBe(false)
  }
}

export const projectDepsShouldBe = (
  projectRoot: string,
  depType: 'dependencies' | 'devDependencies',
  value: any
) => {
  const pkgJson = require(resolve(projectRoot, 'package.json'))
  expect(Object.keys(pkgJson[depType])).toEqual(value)
}
