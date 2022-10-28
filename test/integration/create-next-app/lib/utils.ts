/**
 * @fileoverview
 *
 * This file contains utilities for  `create-next-app` testing.
 */

import { ChildProcess, spawn, SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { projectFiles, projectDeps, projectDevDeps } from './projectFiles'

interface ProjectOptions {
  cwd: string
  projectName: string
}

interface ProjectFiles extends ProjectOptions {
  files: string[]
}

interface ProjectDeps extends ProjectOptions {
  type: 'dependencies' | 'devDependencies'
  deps: string[]
}

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

export const projectFilesShouldExist = ({
  cwd,
  projectName,
  files,
}: ProjectFiles) => {
  const projectRoot = resolve(cwd, projectName)
  for (const file of files) {
    expect(existsSync(resolve(projectRoot, file))).toBe(true)
  }
}

export const projectFilesShouldNotExist = ({
  cwd,
  projectName,
  files,
}: ProjectFiles) => {
  const projectRoot = resolve(cwd, projectName)
  for (const file of files) {
    expect(existsSync(resolve(projectRoot, file))).toBe(false)
  }
}

export const projectDepsShouldBe = ({
  cwd,
  projectName,
  type,
  deps,
}: ProjectDeps) => {
  const projectRoot = resolve(cwd, projectName)
  const pkgJson = require(resolve(projectRoot, 'package.json'))
  expect(Object.keys(pkgJson[type])).toEqual(deps)
}

export const shouldBeJavascriptProject = ({
  cwd,
  projectName,
}: ProjectOptions) => {
  projectFilesShouldExist({
    cwd,
    projectName,
    files: [...projectFiles.global, ...projectFiles.js],
  })

  projectFilesShouldNotExist({
    cwd,
    projectName,
    files: projectFiles.ts,
  })

  projectDepsShouldBe({
    cwd,
    projectName,
    type: 'dependencies',
    deps: projectDeps.js,
  })

  projectDepsShouldBe({
    cwd,
    projectName,
    type: 'devDependencies',
    deps: projectDevDeps.js,
  })
}

export const shouldBeTypescriptProject = ({
  cwd,
  projectName,
}: ProjectOptions) => {
  projectFilesShouldExist({
    cwd,
    projectName,
    files: [...projectFiles.global, ...projectFiles.ts],
  })

  projectFilesShouldNotExist({
    cwd,
    projectName,
    files: projectFiles.js,
  })

  projectDepsShouldBe({
    type: 'dependencies',
    cwd,
    projectName,
    deps: projectDeps.ts,
  })

  projectDepsShouldBe({
    type: 'devDependencies',
    cwd,
    projectName,
    deps: projectDevDeps.ts,
  })
}

export const shouldBeAppProject = ({ cwd, projectName }: ProjectOptions) => {
  projectFilesShouldExist({
    cwd,
    projectName,
    files: [...projectFiles.global, ...projectFiles.app],
  })

  projectFilesShouldNotExist({
    cwd,
    projectName,
    files: projectFiles.js,
  })

  projectDepsShouldBe({
    type: 'dependencies',
    cwd,
    projectName,
    deps: projectDeps.ts,
  })

  projectDepsShouldBe({
    type: 'devDependencies',
    cwd,
    projectName,
    deps: projectDevDeps.ts,
  })
}
