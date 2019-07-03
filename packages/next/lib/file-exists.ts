import fs from 'fs'
import { promisify } from 'util'

const access = promisify(fs.access)

export async function fileExists(fileName: string): Promise<boolean> {
  try {
    await access(fileName, fs.constants.F_OK)
    return true
  } catch (_) {
    return false
  }
}
