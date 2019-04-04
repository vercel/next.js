import { join } from 'path'
import {isWriteable} from '../../build/is-writeable'

export async function findPageFile(rootDir: string, normalizedPagePath: string, pageExtensions: string[], amp: boolean, ampEnabled: boolean): Promise<string|null> {
  if (ampEnabled) {
    // Add falling back to .amp.js extension
    if (!amp) pageExtensions = pageExtensions.concat(pageExtensions.map((ext) => 'amp.' + ext))
  }

  for (let extension of pageExtensions) {
    if (amp) extension = 'amp.' + extension
    const relativePagePath = `${normalizedPagePath}.${extension}`
    const pagePath = join(rootDir, relativePagePath)

    if (await isWriteable(pagePath)) {
      return relativePagePath
    }

    const relativePagePathWithIndex = join(normalizedPagePath, `index.${extension}`)
    const pagePathWithIndex = join(rootDir, relativePagePathWithIndex)
    if (await isWriteable(pagePathWithIndex)) {
      return relativePagePathWithIndex
    }
  }

  return null
}
