import path from 'path'
import { warn } from '../build/output/log'
import { detectTypo } from './detect-typo'
import { realpathSync } from './realpath'
import { printAndExit } from '../server/lib/utils'

export function getProjectDir(dir?: string, exitOnEnoent = true) {
  const resolvedDir = path.resolve(dir || '.')
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
