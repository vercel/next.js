import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'

export function getProjectDir(dir?: string) {
  try {
    const resolvedDir = path.resolve(dir || '.')
    const realDir = fs.realpathSync.native(resolvedDir)

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
