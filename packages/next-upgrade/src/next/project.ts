import { existsSync } from 'fs'
import * as nodeModule from 'module'
import { dirname, join, resolve } from 'path'
import { warn } from '../shared/log'
import { detectTypo } from './detect-typo'
import { realpathSync } from './realpath'

// A Next invocation owns its config and telemetry graph, even for older apps.
// Consume the private bootstrap path before Next snapshots the environment.
export const invokingNext = process.env.__NEXT_UPGRADE_NEXT_PATH
delete process.env.__NEXT_UPGRADE_NEXT_PATH

export function requireFromNext(directory: string) {
  const nextRoot =
    invokingNext ||
    dirname(requireFromProject(directory).resolve('next/package.json'))
  return requireFromProject(nextRoot)
}

export function requireFromProject(directory: string) {
  // NCC treats direct createRequire calls as build-time module resolution.
  // Keep the app's require at runtime, after choosing its installed Next graph.
  return Reflect.apply(Reflect.get(nodeModule, 'createRequire'), null, [
    join(directory, 'package.json'),
  ]) as NodeRequire
}

export function getProjectDir(dir: string | undefined, exitOnEnoent = true) {
  const resolvedDir = resolve(dir || '.')
  try {
    const realDir = realpathSync(resolvedDir)

    if (
      resolvedDir !== realDir &&
      resolvedDir.toLowerCase() === realDir.toLowerCase()
    ) {
      warn(
        `Invalid casing detected for project dir, received ${resolvedDir} actual path ${realDir}, see more info here https://nextjs.org/docs/messages/invalid-project-dir-casing`
      )
    }

    return realDir
  } catch (err: any) {
    if (err.code === 'ENOENT' && exitOnEnoent) {
      if (typeof dir === 'string') {
        const detectedTypo = detectTypo(dir, [
          'build',
          'dev',
          'info',
          'lint',
          'start',
          'telemetry',
          'experimental-test',
        ])

        if (detectedTypo) {
          return printAndExit(
            `"next ${dir}" does not exist. Did you mean "next ${detectedTypo}"?`
          )
        }
      }

      return printAndExit(
        `Invalid project directory provided, no such directory: ${resolvedDir}`
      )
    }
    throw err
  }
}

export function findDir(directory: string, name: 'app' | 'pages') {
  for (const candidate of [
    join(directory, name),
    join(directory, 'src', name),
  ]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export function warnMissingReactDependencies(directory: string) {
  for (const dependency of ['react', 'react-dom']) {
    try {
      requireFromProject(directory).resolve(dependency)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw error
      }
      console.warn(
        `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
      )
    }
  }
}

function printAndExit(message: string, code = 1) {
  if (code === 0) {
    console.log(message)
  } else {
    console.error(message)
  }

  return process.exit(code)
}
