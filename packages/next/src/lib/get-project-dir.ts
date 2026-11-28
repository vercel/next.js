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

    // On Windows, align the drive-letter casing of the project dir with Next.js's
    // own location when they are on the same drive. Otherwise, if Next.js was loaded
    // via a path with differing drive-letter casing (e.g. VS Code launching "c:\..."
    // while the project dir is "C:\..."), Node's module cache treats them as separate
    // paths and can load duplicate copies of external modules like React.
    let finalDir = realDir
    if (
      process.platform === 'win32' &&
      typeof finalDir === 'string' &&
      finalDir.length > 2 &&
      finalDir[1] === ':'
    ) {
      const nextDrive = __dirname[0]
      if (
        nextDrive.toLowerCase() === finalDir[0].toLowerCase() &&
        nextDrive !== finalDir[0]
      ) {
        finalDir = nextDrive + finalDir.slice(1)
      }
    }

    return finalDir
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
