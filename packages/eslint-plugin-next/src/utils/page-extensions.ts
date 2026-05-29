import fs from 'fs'
import path from 'path'

export const defaultPageExtensions = ['tsx', 'ts', 'jsx', 'js']

const nextConfigFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts']
const pageExtensionsRegex = /pageExtensions\s*:\s*\[([\s\S]*?)\]/m
const stringLiteralRegex = /(['"`])((?:\\.|(?!\1).)*)\1/g
const commentRegex = /\/\*[\s\S]*?\*\/|\/\/.*$/gm
const pageExtensionsCache: Record<string, string[]> = {}

const parsePageExtensions = (source: string) => {
  const pageExtensionsMatch = source.match(pageExtensionsRegex)

  if (!pageExtensionsMatch) {
    return null
  }

  const pageExtensionsSource = pageExtensionsMatch[1].replace(commentRegex, '')
  const pageExtensions = Array.from(
    pageExtensionsSource.matchAll(stringLiteralRegex),
    ([, , pageExtension]) => pageExtension.replace(/^\./, '')
  )
  const remainingSource = pageExtensionsSource
    .replace(stringLiteralRegex, '')
    .replace(/[\s,]/g, '')

  if (!pageExtensions.length || remainingSource.length > 0) {
    return null
  }

  return pageExtensions
}

export const getPageExtensions = (rootDir: string) => {
  if (!(rootDir in pageExtensionsCache)) {
    const configuredPageExtensions = nextConfigFiles
      .map((configFile) => path.join(rootDir, configFile))
      .filter((configPath) => fs.existsSync(configPath))
      .map((configPath) =>
        parsePageExtensions(fs.readFileSync(configPath, 'utf8'))
      )
      .find(Boolean)

    pageExtensionsCache[rootDir] =
      configuredPageExtensions ?? defaultPageExtensions
  }

  return pageExtensionsCache[rootDir]
}
