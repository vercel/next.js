import path from 'path'
import chalk from 'chalk'
import dotenv from 'next/dist/compiled/dotenv'
import { ENV_FILE } from '../next-server/lib/constants'
import dotenvExpand from 'next/dist/compiled/dotenv-expand'

export type Env = { [key: string]: string }

export function loadEnvConfig(dir: string, dev?: boolean): void {
  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    `${ENV_FILE}.${mode}.local`,
    `${ENV_FILE}.${mode}`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `${ENV_FILE}.local`,
    ENV_FILE,
  ].filter(Boolean) as string[]

  for (const envFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    const dotEnvPath = path.join(dir, envFile)
    const result = dotenvExpand(dotenv.config({ path: dotEnvPath }))

    if (result.parsed) {
      console.log(`> ${chalk.cyan.bold('Info:')} Loaded env from ${envFile}`)
    }
  }
}
