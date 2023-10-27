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
  shouldBeTemplateProject,
  spawnExitPromise,
} from './lib/utils'

import { useTempDir } from '../../lib/use-temp-dir'
import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
import resolveFrom from 'resolve-from'

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

describe('create-next-app --app', () => {
  beforeAll(async () => {
    if (testVersion) return
    // TODO: investigate moving this post publish or create deployed
    // tarballs to avoid these failing while a publish is in progress
    testVersion = 'canary'
    // const span = new Span({ name: 'parent' })
    // testVersion = (
    //   await createNextInstall({ onlyPackages: true, parentSpan: span })
    // ).get('next')
  })

  it('should create TS appDir projects with --ts', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--no-tailwind',
          '--app',
          '--eslint',
          '--no-src-dir',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'ts' })
      await startsWithoutError(
        path.join(cwd, projectName),
        ['default', 'turbo'],
        true
      )
    })
  })

  it('should create JS appDir projects with --js', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--app',
          '--eslint',
          '--no-src-dir',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({ cwd, projectName, template: 'app', mode: 'js' })
      // is landed
      await startsWithoutError(
        path.join(cwd, projectName),
        ['default', 'turbo'],
        true
      )
    })
  })

  it('should create JS appDir projects with --js --src-dir', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--app',
          '--eslint',
          '--src-dir',
          '--import-alias=@/*',
        ],
        {
          cwd,
          stdio: 'inherit',
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'app',
        mode: 'js',
        srcDir: true,
      })
      await startsWithoutError(
        path.join(cwd, projectName),
        ['default', 'turbo'],
        true
      )
    })
  })

  it('should create Tailwind CSS appDir projects with --tailwind', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'appdir-tailwind-test'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--tailwind',
          '--app',
          '--eslint',
          '--src-dir',
          `--import-alias=@/*`,
        ],
        {
          cwd,
        },
        testVersion
      )

      const exitCode = await spawnExitPromise(childProcess)
      expect(exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'app-tw',
        mode: 'ts',
        srcDir: true,
      })
      await startsWithoutError(
        path.join(cwd, projectName),
        ['default', 'turbo'],
        true
      )
    })
  })
})
