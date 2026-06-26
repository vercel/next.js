import { W_OK } from 'node:constants'
import { access } from 'node:fs/promises'

export async function isWriteable(directory: string): Promise<boolean> {
  try {
    await access(directory, W_OK)
    return true
  } catch (err) {
    return false
  }
}
