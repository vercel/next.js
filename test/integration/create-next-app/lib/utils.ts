/**
 * @fileoverview
 *
 * This file contains utilities for  `create-next-app` testing.
 */

import { ChildProcess, spawn, SpawnOptions } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import glob from 'glob'
import Conf from 'next/dist/compiled/conf'

import {
  getProjectSetting,
  mapSrcFiles,
  projectSpecification,
} from './specification'
import { CustomTemplateOptions, ProjectDeps, ProjectFiles } from './types'

const cli = require.resolve('create-next-app/dist/index.js')

/**
 * Run the built version of `create-next-app` with the given arguments.
 */
export const createNextApp = (
  args: string[],
  options?: SpawnOptions,
  testVersion?: string
) => {
  const conf = new Conf({ projectName: 'create-next-app' })
  conf.clear()

  console.log(`[TEST] $ ${cli} ${args.join(' ')}`, { options })

  const cloneEnv = { ...process.env }
  // unset CI env as this skips the auto-install behavior
  // being tested
  delete cloneEnv.CI
  delete cloneEnv.CIRCLECI
  delete cloneEnv.GITHUB_ACTIONS
  delete cloneEnv.CONTINUOUS_INTEGRATION
  delete cloneEnv.RUN_ID
  delete cloneEnv.BUILD_NUMBER

  cloneEnv.NEXT_PRIVATE_TEST_VERSION = testVersion || 'canary'

  return spawn('node', [cli].concat(args), {
    ...options,
    env: {
      ...cloneEnv,
      ...options.env,
    },
  })
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
    try {
      expect(existsSync(resolve(projectRoot, file))).toBe(true)
    } catch (err) {
      require('console').error(
        `missing expected file ${file}`,
        glob.sync('**/*', { cwd, ignore: '**/node_modules/**' }),
        files
      )
      throw err
    }
  }
}

export const projectFilesShouldNotExist = ({
  cwd,
  projectName,
  files,
}: ProjectFiles) => {
  const projectRoot = resolve(cwd, projectName)
  for (const file of files) {
    try {
      expect(existsSync(resolve(projectRoot, file))).toBe(false)
    } catch (err) {
      require('console').error(
        `unexpected file present ${file}`,
        glob.sync('**/*', { cwd, ignore: '**/node_modules/**' }),
        files
      )
      throw err
    }
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
  expect(Object.keys(pkgJson[type] || {}).sort()).toEqual(deps.sort())
}

export const shouldBeTemplateProject = ({
  cwd,
  projectName,
  template,
  mode,
  srcDir,
}: CustomTemplateOptions) => {
  projectFilesShouldExist({
    cwd,
    projectName,
    files: getProjectSetting({ template, mode, setting: 'files', srcDir }),
  })

  // Tailwind templates share the same files (tailwind.config.js, postcss.config.js)
  if (template !== 'app-tw' && template !== 'default-tw') {
    projectFilesShouldNotExist({
      cwd,
      projectName,
      files: mapSrcFiles(
        projectSpecification[template][mode === 'js' ? 'ts' : 'js'].files,
        srcDir
      ),
    })
  }

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
  srcDir,
}: Omit<CustomTemplateOptions, 'mode'>) => {
  shouldBeTemplateProject({ cwd, projectName, template, mode: 'js', srcDir })
}

export const shouldBeTypescriptProject = ({
  cwd,
  projectName,
  template,
  srcDir,
}: Omit<CustomTemplateOptions, 'mode'>) => {
  shouldBeTemplateProject({ cwd, projectName, template, mode: 'ts', srcDir })
}
