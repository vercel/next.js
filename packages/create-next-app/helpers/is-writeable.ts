import fs from 'fs'

export async function isWriteable(directory: string): Promise<boolean> {
  try {
    await fs.promises.access(directory, (fs.constants || fs).W_OK)
    return true
  } catch (err) {
    return false
  }
}
