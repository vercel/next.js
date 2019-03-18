import { join } from 'path'
import {isWriteable} from '../../build/is-writeable'

export async function findPageFile(rootDir: string, normalizedPagePath: string, pageExtensions: string[]): Promise<string|null> {
  const pathParts = normalizedPagePath.split('.')
  const addAmp = pathParts.pop() === 'amp'
  normalizedPagePath = pathParts.join('.') || normalizedPagePath

  for (let extension of pageExtensions) {
    if (addAmp) extension = 'amp.' + extension
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
