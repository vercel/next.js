import path from 'path'
import promisify from '../../lib/promisify'
import globModule from 'glob'
import {CLIENT_STATIC_FILES_PATH} from '../../lib/constants'

const glob = promisify(globModule)

export async function getPages (dir, {nextPagesDir, dev, buildId, isServer, pageExtensions, rootPaths}) {
  const pagePathsByRoot = await getPagePaths(dir, {dev, isServer, pageExtensions, rootPaths})

  return getMultiRootPageEntries(pagePathsByRoot, {nextPagesDir, buildId, isServer, pageExtensions})
}

export async function getPagePaths (dir, {dev, isServer, pageExtensions, rootPaths}) {
  // In development we only compile _document.js, _error.js and _app.js when starting, since they're always needed. All other pages are compiled with on demand entries
  // _document also has to be in the client compiler in development because we want to detect HMR changes and reload the client.
  // In production get all pages from the pages directory.
  const filePattern = dev
    ? (
      isServer
        ? `pages/+(_document|_app|_error).+(${pageExtensions})`
        : `pages/+(_app|_error).+(${pageExtensions})`
    )
    : (
      isServer
        ? `pages/**/*.+(${pageExtensions})`
        : `pages/**/!(_document)*.+(${pageExtensions})`
    )

  return Promise.all(rootPaths.map(async root => {
    const pages = await glob(`${root}/${filePattern}`, { cwd: dir })
    return { root, pages }
  }))
}

// Convert page path into single entry
export function createEntry (filePath, {buildId = '', name, pageExtensions, root = '.'} = {}) {
  const parsedPath = path.parse(filePath)
  const relativePath = path.relative(root, filePath)
  const parsedRelativePath = path.parse(relativePath)
  let entryName = name || relativePath

  // This makes sure we compile `pages/blog/index.js` to `pages/blog.js`.
  // Excludes `pages/index.js` from this rule since we do want `/` to route to `pages/index.js`
  if (parsedRelativePath.dir !== 'pages' && parsedRelativePath.name === 'index') {
    entryName = `${parsedRelativePath.dir}.js`
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
export function getPageEntries (pagePaths, opts) {
  return getMultiRootPageEntries([{ root: '.', pages: pagePaths }], opts)
}

function getMultiRootPageEntries (pagePathsByRoot, {nextPagesDir, buildId, isServer = false, pageExtensions} = {}) {
  const entries = {}

  for (const { root, pages } of pagePathsByRoot) {
    for (const filePath of pages) {
      const entry = createEntry(filePath, {pageExtensions, root, buildId})
      if (!(entry.name in entries)) {
        entries[entry.name] = entry.files
      }
    }
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
