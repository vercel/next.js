import fs from 'fs'
import { promisify } from 'util'

const access = promisify(fs.access)

export async function isWriteable(directory: string): Promise<boolean> {
  try {
    await access(directory, (fs.constants || fs).W_OK)
    return true
  } catch (err) {
    return false
  }
}
