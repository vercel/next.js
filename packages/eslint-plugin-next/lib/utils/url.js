const fs = require('fs')
const path = require('path')

// Cache for fs.lstatSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsLstatSyncCache = {}
const fsLstatSync = (source) => {
  fsLstatSyncCache[source] = fsLstatSyncCache[source] || fs.lstatSync(source)
  return fsLstatSyncCache[source]
}

/**
 * Checks if the source is a directory.
 * @param {string} source
 */
function isDirectory(source) {
  return fsLstatSync(source).isDirectory()
}

/**
 * Checks if the source is a directory.
 * @param {string} source
 */
function isSymlink(source) {
  return fsLstatSync(source).isSymbolicLink()
}

/**
 * Gets the possible URLs from a directory.
 * @param {string} urlprefix
 * @param {string[]} directories
 */
function getUrlFromPagesDirectories(urlPrefix, directories) {
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) => parseUrlForPages(urlPrefix, directory))
        .flat()
        .map(
          // Since the URLs are normalized we add `^` and `$` to the RegExp to make sure they match exactly.
          (url) => `^${normalizeURL(url)}$`
        )
    )
  ).map((urlReg) => {
    urlReg = urlReg.replace(/\[.*\]/g, '((?!.+?\\..+?).*?)')
    return new RegExp(urlReg)
  })
}

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

/**
 * Recursively parse directory for page URLs.
 * @param {string} urlprefix
 * @param {string} directory
 */
function parseUrlForPages(urlprefix, directory) {
  fsReadDirSyncCache[directory] =
    fsReadDirSyncCache[directory] || fs.readdirSync(directory)
  const res = []
  fsReadDirSyncCache[directory].forEach((fname) => {
    // TODO: this should account for all page extensions
    // not just js(x) and ts(x)
    if (/(\.(j|t)sx?)$/.test(fname)) {
      if (/^index(\.(j|t)sx?)$/.test(fname)) {
        res.push(`${urlprefix}${fname.replace(/^index(\.(j|t)sx?)$/, '')}`)
      }
      res.push(`${urlprefix}${fname.replace(/(\.(j|t)sx?)$/, '')}`)
    } else {
      const dirPath = path.join(directory, fname)
      if (isDirectory(dirPath) && !isSymlink(dirPath)) {
        res.push(...parseUrlForPages(urlprefix + fname + '/', dirPath))
      }
    }
  })
  return res
}

/**
 * Takes a URL and does the following things.
 *  - Replaces `index.html` with `/`
 *  - Makes sure all URLs are have a trailing `/`
 *  - Removes query string
 * @param {string} url
 */
function normalizeURL(url) {
  if (!url) {
    return
  }
  url = url.split('?')[0]
  url = url.split('#')[0]
  url = url = url.replace(/(\/index\.html)$/, '/')
  // Empty URLs should not be trailed with `/`, e.g. `#heading`
  if (url === '') {
    return url
  }
  url = url.endsWith('/') ? url : url + '/'
  return url
}

function execOnce(fn) {
  let used = false
  let result

  return (...args) => {
    if (!used) {
      used = true
      result = fn(...args)
    }
    return result
  }
}

module.exports = {
  getUrlFromPagesDirectories,
  normalizeURL,
  execOnce,
}
