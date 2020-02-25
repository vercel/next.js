import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import dotenvExpand from 'next/dist/compiled/dotenv-expand'
import dotenv, { DotenvConfigOutput } from 'next/dist/compiled/dotenv'

export type Env = { [key: string]: string }

export function loadEnvConfig(dir: string, dev?: boolean): Env {
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

  return combinedEnv
}
