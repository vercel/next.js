// @flow
import path from 'path'
import promisify from '../../lib/promisify'
import globModule from 'glob'

const glob = promisify(globModule)

type GetPagesContext = {|
  nextPagesDir: string,
  dev: boolean,
  isServer: boolean,
  pageExtensions: string
|}

export async function getPages (dir: string, {nextPagesDir, dev, isServer, pageExtensions}: GetPagesContext) {
  const pageFiles = await getPagePaths(dir, {dev, isServer, pageExtensions})
  // console.log(pageFiles)

  return getPageEntries(pageFiles, {nextPagesDir, isServer, pageExtensions})
}

type GetPagePathsContext = {|
  dev: boolean,
  isServer: boolean,
  pageExtensions: string
|}

export async function getPagePaths (dir: string, {dev, isServer, pageExtensions}: GetPagePathsContext) {
  if (dev) {
    // In development we only compile _document.js, _error.js and _app.js when starting, since they're always needed. All other pages are compiled with on demand entries
    return glob(isServer ? `pages/+(_document|_app|_error).+(${pageExtensions})` : `pages/+(_app|_error).+(${pageExtensions})`, { cwd: dir })
  }

  // In production get all pages from the pages directory
  return glob(isServer ? `pages/**/*.+(${pageExtensions})` : `pages/**/!(_document)*.+(${pageExtensions})`, { cwd: dir })
}

type CreateEntryContext = {|
name?: string,
pageExtensions?: string
|}

// Convert page path into single entry
export function createEntry (filePath: string, {name, pageExtensions}: CreateEntryContext = {}) {
  const parsedPath = path.parse(filePath)
  let entryName = name || filePath

  // This makes sure we compile `pages/blog/index.js` to `pages/blog.js`.
  // Excludes `pages/index.js` from this rule since we do want `/` to route to `pages/index.js`
  if (parsedPath.dir !== 'pages' && parsedPath.name === 'index') {
    entryName = `${parsedPath.dir}`
  }

  // Makes sure supported extensions are stripped off. The outputted file should always be `.js`
  if (pageExtensions) {
    entryName = entryName.replace(new RegExp(`\\.+(${pageExtensions})$`), '')
  }

  return {
    name: path.join('bundles', entryName),
    files: [parsedPath.root ? filePath : `./${filePath}`] // The entry always has to be an array.
  }
}

type GetPageEntriesContext = {|
  nextPagesDir: string,
  isServer: boolean,
  pageExtensions: string
|}

// Convert page paths into entries
export function getPageEntries (pagePaths: Array<string>, {nextPagesDir, isServer = false, pageExtensions}: GetPageEntriesContext = {}) {
  const entries = {}

  for (const filePath of pagePaths) {
    const entry = createEntry(filePath, {pageExtensions})
    entries[entry.name] = entry.files
  }

  const appPagePath = path.join(nextPagesDir, '_app.js')
  const appPageEntry = createEntry(appPagePath, {name: 'pages/_app'}) // default app.js
  if (!entries[appPageEntry.name]) {
    entries[appPageEntry.name] = appPageEntry.files
  }

  const errorPagePath = path.join(nextPagesDir, '_error.js')
  const errorPageEntry = createEntry(errorPagePath, {name: 'pages/_error'}) // default error.js
  if (!entries[errorPageEntry.name]) {
    entries[errorPageEntry.name] = errorPageEntry.files
  }

  if (isServer) {
    const documentPagePath = path.join(nextPagesDir, '_document.js')
    const documentPageEntry = createEntry(documentPagePath, {name: 'pages/_document'}) // default _document.js
    if (!entries[documentPageEntry.name]) {
      entries[documentPageEntry.name] = documentPageEntry.files
    }
  }

  return entries
}
