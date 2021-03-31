const fs = require('fs')
const path = require('path')

/**
 * Checks if the source is a directory.
 * @param {string} source
 */
function isDirectory(source) {
  return fs.lstatSync(source).isDirectory()
}

/**
 * Checks if the source is a directory.
 * @param {string} source
 */
function isSymlink(source) {
  return fs.lstatSync(source).isSymbolicLink()
}

/**
 * Gets the possible URLs from a directory.
 * @param {string} urlprefix
 * @param {string} directory
 */
function getUrlFromPagesDirectory(urlPrefix, directory) {
  return parseUrlForPages(urlPrefix, directory).map(
    // Since the URLs are normalized we add `^` and `$` to the RegExp to make sure they match exactly.
    (url) => new RegExp(`^${normalizeURL(url)}$`)
  )
}

/**
 * Recursively parse directory for page URLs.
 * @param {string} urlprefix
 * @param {string} directory
 */
function parseUrlForPages(urlprefix, directory) {
  const files = fs.readdirSync(directory)
  const res = []
  files.forEach((fname) => {
    if (/(\.(j|t)sx?)$/.test(fname)) {
      fname = fname.replace(/\[.*\]/g, '.*')
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

module.exports = {
  getUrlFromPagesDirectory,
  normalizeURL,
}
