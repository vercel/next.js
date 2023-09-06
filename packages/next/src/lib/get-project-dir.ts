import path from 'path'
import { commands } from './commands'
import * as Log from '../build/output/log'
import { detectTypo } from './detect-typo'
import { realpathSync } from './realpath'

export function getProjectDir(dir?: string) {
  try {
    const resolvedDir = path.resolve(dir || '.')
    const realDir = realpathSync(resolvedDir)

    if (
      resolvedDir !== realDir &&
      resolvedDir.toLowerCase() === realDir.toLowerCase()
    ) {
      Log.warn(
        `Invalid casing detected for project dir, received ${resolvedDir} actual path ${realDir}, see more info here https://nextjs.org/docs/messages/invalid-project-dir-casing`
      )
    }

    return realDir
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      if (typeof dir === 'string') {
        const detectedTypo = detectTypo(dir, Object.keys(commands))

        if (detectedTypo) {
          Log.error(
            `"next ${dir}" does not exist. Did you mean "next ${detectedTypo}"?`
          )
          process.exit(1)
        }
      }

      Log.error(
        `Invalid project directory provided, no such directory: ${path.resolve(
          dir || '.'
        )}`
      )
      process.exit(1)
    }
    throw err
  }
}
