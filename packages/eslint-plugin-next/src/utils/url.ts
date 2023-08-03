import * as path from 'path'
import * as fs from 'fs'

/**
 * These characters `(.*+?^${}()|[]\)` are considered special characters in regular expressions, and need to be escaped if they are to be matched literally.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
 */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache: Record<string, fs.Dirent[]> = {}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensions: string[]
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })

  const res: string[] = []

  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
      res.push(
        ...parseUrlForPages(
          urlprefix + dirent.name + '/',
          path.join(directory, dirent.name),
          pageExtensions
        )
      )
      return
    }

    const ext = pageExtensions.find((pageExtension) =>
      new RegExp(`\\.${escapeRegExp(pageExtension)}$`).test(dirent.name)
    )

    if (!ext) return

    const replaced = escapeRegExp(ext)
    const startsIndexReg = new RegExp(`^index\\.${replaced}$`)

    if (startsIndexReg.test(dirent.name)) {
      res.push(urlprefix + dirent.name.replace(startsIndexReg, ''))
    } else {
      res.push(
        urlprefix + dirent.name.replace(new RegExp(`\\.${replaced}$`), '')
      )
    }
  })

  return res
}

/**
 * Takes a URL and does the following things.
 *  - Replaces `index.html` with `/`
 *  - Makes sure all URLs are have a trailing `/`
 *  - Removes query string
 */
export function normalizeURL(url: string) {
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

/**
 * Gets the possible URLs from a directory.
 */
export function getUrlFromPagesDirectories(
  urlPrefix: string,
  directories: string[],
  pageExtensions: string[]
) {
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) =>
          parseUrlForPages(urlPrefix, directory, pageExtensions)
        )
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

export function execOnce<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  let used = false
  let result: TResult

  return (...args: TArgs) => {
    if (!used) {
      used = true
      result = fn(...args)
    }
    return result
  }
}
