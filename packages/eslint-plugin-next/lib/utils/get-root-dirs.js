// @ts-check
const glob = require('glob')

/**
 * Process a Next.js root directory glob.
 *
 * @param {string} rootDir - A Next.js root directory glob.
 * @returns {string[]} - An array of Root directories.
 */
const processRootDir = (rootDir) => {
  // Ensures we only match folders.
  if (!rootDir.endsWith('/')) rootDir += '/'
  return glob.sync(rootDir)
}

/**
 * Gets one or more Root
 *
 * @param {import('eslint').Rule.RuleContext} context - ESLint rule context
 * @returns An array of root directories.
 */
const getRootDirs = (context) => {
  let rootDirs = [context.getCwd()]

  /** @type {{rootDir?:string|string[]}|undefined} */
  const nextSettings = context.settings.next || {}
  let rootDir = nextSettings.rootDir

  if (typeof rootDir === 'string') {
    rootDirs = processRootDir(rootDir)
  } else if (Array.isArray(rootDir)) {
    rootDirs = rootDir
      .map((dir) => (typeof dir === 'string' ? processRootDir(dir) : []))
      .flat()
  }

  return rootDirs
}

module.exports = getRootDirs
