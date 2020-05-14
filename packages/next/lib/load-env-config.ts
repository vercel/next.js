import fs from 'fs'
import path from 'path'
import * as log from '../build/output/log'
import findUp from 'next/dist/compiled/find-up'
import { execOnce } from '../next-server/lib/utils'
import dotenvExpand from 'next/dist/compiled/dotenv-expand'
import dotenv, { DotenvConfigOutput } from 'next/dist/compiled/dotenv'

export type Env = { [key: string]: string }

const packageJsonHasDep = (packageJsonPath: string, dep: string): boolean => {
  const { dependencies, devDependencies } = require(packageJsonPath)
  const allPackages = Object.keys({
    ...dependencies,
    ...devDependencies,
  })

  return allPackages.some(pkg => pkg === dep)
}

let combinedEnv: Env | undefined = undefined

const envLoadingDisabledWarning = execOnce((packageFile?: string) => {
  log.warn(
    (packageFile
      ? `dotenv loading was disabled due to the \`dotenv\` package being installed in: ${packageFile}`
      : `dotenv loading was disabled due to no package.json file able to be found`) +
      `\nSee more info here: https://err.sh/next.js/env-loading-disabled`
  )
})

export function loadEnvConfig(dir: string, dev?: boolean): Env | false {
  if (combinedEnv) return combinedEnv

  const packageJson = findUp.sync('package.json', { cwd: dir })

  // only do new env loading if dotenv isn't installed since we
  // can't check for an experimental flag in next.config.js
  // since we want to load the env before loading next.config.js
  if (packageJson) {
    // check main `package.json` first
    if (packageJsonHasDep(packageJson, 'dotenv')) {
      envLoadingDisabledWarning(path.relative(dir, packageJson))
      return false
    }
    // check for a yarn.lock or lerna.json file in case it's a monorepo
    const monorepoFile = findUp.sync(
      ['yarn.lock', 'lerna.json', 'package-lock.json'],
      { cwd: dir }
    )

    if (monorepoFile) {
      const monorepoRoot = path.dirname(monorepoFile)
      const monorepoPackageJson = path.join(monorepoRoot, 'package.json')

      try {
        if (packageJsonHasDep(monorepoPackageJson, 'dotenv')) {
          envLoadingDisabledWarning(path.relative(dir, monorepoPackageJson))
          return false
        }
      } catch (_) {}
    }
  } else {
    // we should always have a package.json but disable in case we don't
    envLoadingDisabledWarning()
    return false
  }

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `.env.local`,
    '.env',
  ].filter(Boolean) as string[]

  combinedEnv = {
    ...(process.env as any),
  } as Env

  for (const envFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    const dotEnvPath = path.join(dir, envFile)

    try {
      const stats = fs.statSync(dotEnvPath)

      // make sure to only attempt to read files
      if (!stats.isFile()) {
        continue
      }

      const contents = fs.readFileSync(dotEnvPath, 'utf8')
      let result: DotenvConfigOutput = {}
      result.parsed = dotenv.parse(contents)

      result = dotenvExpand(result)

      if (result.parsed) {
        log.info(`Loaded env from ${envFile}`)
      }

      Object.assign(combinedEnv, result.parsed)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${envFile}`, err)
      }
    }
  }

  // load global env values prefixed with `NEXT_PUBLIC_` to process.env
  for (const key of Object.keys(combinedEnv)) {
    if (
      key.startsWith('NEXT_PUBLIC_') &&
      typeof process.env[key] === 'undefined'
    ) {
      process.env[key] = combinedEnv[key]
    }
  }

  return combinedEnv
}
