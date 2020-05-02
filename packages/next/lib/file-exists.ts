import { promises, constants } from 'fs'

export async function fileExists(fileName: string): Promise<boolean> {
  try {
    await promises.access(fileName, constants.F_OK)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false
    }
    throw err
  }
}
