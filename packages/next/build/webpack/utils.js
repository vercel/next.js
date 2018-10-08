import path from 'path'
import promisify from '../../lib/promisify'
import globModule from 'glob'
import {CLIENT_STATIC_FILES_PATH} from 'next-server/constants'
import {normalizePagePath} from 'next-server/dist/server/require'

const glob = promisify(globModule)

export async function getPages (dir, {pages, nextPagesDir, dev, buildId, isServer, pageExtensions}) {
  const pageFiles = await getPagePaths(dir, {pages, dev, isServer, pageExtensions})

  return getPageEntries(pageFiles, {nextPagesDir, buildId, isServer, pageExtensions})
}

export async function getPagePaths (dir, {pages, dev, isServer, pageExtensions}) {
  if (dev || pages) {
    // In development or when page files are provided we only compile _document.js, _error.js and _app.js when starting, since they're always needed. All other pages are compiled with on demand entries
    const defaultPages = await glob(isServer ? `pages/+(_document|_app|_error).+(${pageExtensions})` : `pages/+(_app|_error).+(${pageExtensions})`, { cwd: dir })
    const resolvedFiles = await Promise.all((pages || []).map(async (file) => {
      const normalizedPagePath = normalizePagePath(file)
      const paths = await glob(`pages/{${normalizedPagePath}/index,${normalizedPagePath}}.+(${pageExtensions})`, {cwd: dir})
      if (paths.length === 0) {
        return null
      }

      return paths[0]
    }))

    return [...new Set([...defaultPages, ...resolvedFiles.filter(f => f !== null)])]
  }
  // In production when no page files are provided get all pages from the pages directory
  return glob(isServer ? `pages/**/*.+(${pageExtensions})` : `pages/**/!(_document)*.+(${pageExtensions})`, { cwd: dir })
}

// Convert page path into single entry
export function createEntry (filePath, {buildId = '', name, pageExtensions} = {}) {
  const parsedPath = path.parse(filePath)
  let entryName = name || filePath

  // This makes sure we compile `pages/blog/index.js` to `pages/blog.js`.
  // Excludes `pages/index.js` from this rule since we do want `/` to route to `pages/index.js`
  if (parsedPath.dir !== 'pages' && parsedPath.name === 'index') {
    entryName = `${parsedPath.dir}.js`
  }

  // Makes sure supported extensions are stripped off. The outputted file should always be `.js`
  if (pageExtensions) {
    entryName = entryName.replace(new RegExp(`\\.+(${pageExtensions})$`), '.js')
  }

  return {
    name: path.join(CLIENT_STATIC_FILES_PATH, buildId, entryName),
    files: [parsedPath.root ? filePath : `./${filePath}`] // The entry always has to be an array.
  }
}

// Convert page paths into entries
export function getPageEntries (pagePaths, {nextPagesDir, buildId, isServer = false, pageExtensions} = {}) {
  const entries = {}

  for (const filePath of pagePaths) {
    const entry = createEntry(filePath, {pageExtensions, buildId})
    entries[entry.name] = entry.files
  }

  const appPagePath = path.join(nextPagesDir, '_app.js')
  const appPageEntry = createEntry(appPagePath, {buildId, name: 'pages/_app.js'}) // default app.js
  if (!entries[appPageEntry.name]) {
    entries[appPageEntry.name] = appPageEntry.files
  }

  const errorPagePath = path.join(nextPagesDir, '_error.js')
  const errorPageEntry = createEntry(errorPagePath, {buildId, name: 'pages/_error.js'}) // default error.js
  if (!entries[errorPageEntry.name]) {
    entries[errorPageEntry.name] = errorPageEntry.files
  }

  if (isServer) {
    const documentPagePath = path.join(nextPagesDir, '_document.js')
    const documentPageEntry = createEntry(documentPagePath, {buildId, name: 'pages/_document.js'}) // default _document.js
    if (!entries[documentPageEntry.name]) {
      entries[documentPageEntry.name] = documentPageEntry.files
    }
  }

  return entries
}
