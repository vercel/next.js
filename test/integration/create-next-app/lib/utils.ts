/**
 * @fileoverview
 *
 * This file contains utilities for  `create-next-app` testing.
 */

import { ChildProcess, spawn, SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { getProjectSetting, projectSpecification } from './specification'
import { CustomTemplateOptions, ProjectDeps, ProjectFiles } from './types'

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
  expect(Object.keys(pkgJson[type]).sort()).toEqual(deps.sort())
}

export const shouldBeTemplateProject = ({
  cwd,
  projectName,
  template,
  mode,
}: CustomTemplateOptions) => {
  projectFilesShouldExist({
    cwd,
    projectName,
    files: getProjectSetting({ template, mode, setting: 'files' }),
  })

  projectFilesShouldNotExist({
    cwd,
    projectName,
    files: projectSpecification[template][mode === 'js' ? 'ts' : 'js'].files,
  })

  projectDepsShouldBe({
    type: 'dependencies',
    cwd,
    projectName,
    deps: getProjectSetting({ template, mode, setting: 'deps' }),
  })

  projectDepsShouldBe({
    type: 'devDependencies',
    cwd,
    projectName,
    deps: getProjectSetting({ template, mode, setting: 'devDeps' }),
  })
}

export const shouldBeJavascriptProject = ({
  cwd,
  projectName,
  template,
}: Omit<CustomTemplateOptions, 'mode'>) => {
  shouldBeTemplateProject({ cwd, projectName, template, mode: 'js' })
}

export const shouldBeTypescriptProject = ({
  cwd,
  projectName,
  template,
}: Omit<CustomTemplateOptions, 'mode'>) => {
  shouldBeTemplateProject({ cwd, projectName, template, mode: 'ts' })
}
