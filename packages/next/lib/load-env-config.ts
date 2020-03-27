import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import dotenvExpand from 'next/dist/compiled/dotenv-expand'
import dotenv, { DotenvConfigOutput } from 'next/dist/compiled/dotenv'
import findUp from 'find-up'

export type Env = { [key: string]: string }

export function loadEnvConfig(dir: string, dev?: boolean): Env | false {
  const packageJson = findUp.sync('package.json', { cwd: dir })

  // only do new env loading if dotenv isn't installed since we
  // can't check for an experimental flag in next.config.js
  // since we want to load the env before loading next.config.js
  if (packageJson) {
    const { dependencies, devDependencies } = require(packageJson)
    const allPackages = Object.keys({
      ...dependencies,
      ...devDependencies,
    })

    if (allPackages.some(pkg => pkg === 'dotenv')) {
      return false
    }
  } else {
    // we should always have a package.json but disable in case we don't
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

  const combinedEnv: Env = {
    ...(process.env as any),
  }

  for (const envFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    const dotEnvPath = path.join(dir, envFile)

    try {
      const contents = fs.readFileSync(dotEnvPath, 'utf8')
      let result: DotenvConfigOutput = {}
      result.parsed = dotenv.parse(contents)

      result = dotenvExpand(result)

      if (result.parsed) {
        console.log(`> ${chalk.cyan.bold('Info:')} Loaded env from ${envFile}`)
      }

      Object.assign(combinedEnv, result.parsed)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.log(
          `> ${chalk.cyan.bold('Error: ')} Failed to load env from ${envFile}`,
          err
        )
      }
    }
  }

  // load global env values prefixed with `NEXT_APP_` to process.env
  for (const key of Object.keys(combinedEnv)) {
    if (
      key.startsWith('NEXT_APP_') &&
      typeof process.env[key] === 'undefined'
    ) {
      process.env[key] = combinedEnv[key]
    }
  }

  return combinedEnv
}
