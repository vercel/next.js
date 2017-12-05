import { write as copy } from 'clipboardy'

export async function copyToClipboard (text) {
  try {
    await copy(text)
    return true
  } catch (err) {
    return false
  }
}
