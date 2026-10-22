const formatToExtension = new Map([
  ['woff', 'woff'],
  ['woff2', 'woff2'],
  ['truetype', 'ttf'],
  ['opentype', 'otf'],
  ['embedded-opentype', 'eot'],
])

/**
 * Find all font files in the CSS response and determine which files should be preloaded.
 * In Google Fonts responses, the @font-face's subset is above it in a comment.
 * Walk through the CSS from top to bottom, keeping track of the current subset.
 */
export function findFontFilesInCss(css: string, subsetsToPreload?: string[]) {
  // Find font files to download
  const fontFiles: Array<{
    googleFontFileUrl: string
    preloadFontFile: boolean
    ext: string
  }> = []

  // Keep track of the current subset
  let currentSubset = ''
  for (const line of css.split('\n')) {
    const newSubset = /\/\* (.+?) \*\//.exec(line)?.[1]
    if (newSubset) {
      // Found new subset in a comment above the next @font-face declaration
      currentSubset = newSubset
    } else {
      const googleFontFileUrl = /src: url\((.+?)\)/.exec(line)?.[1]
      if (
        googleFontFileUrl &&
        !fontFiles.some(
          (foundFile) => foundFile.googleFontFileUrl === googleFontFileUrl
        )
      ) {
        // Google can return extensionless /l/font?kit=... URLs. Prefer the
        // pathname extension, then the CSS format hint. Our Chrome user agent
        // requests WOFF2, so use that when neither specifies a supported type.
        const pathname = googleFontFileUrl.split(/[?#]/, 1)[0]
        const format = /format\(['"](.+?)['"]\)/.exec(line)?.[1]
        const ext =
          /\.(woff|woff2|eot|ttf|otf)$/.exec(pathname)?.[1] ??
          formatToExtension.get(format ?? '') ??
          'woff2'

        fontFiles.push({
          googleFontFileUrl,
          preloadFontFile: !!subsetsToPreload?.includes(currentSubset),
          ext,
        })
      }
    }
  }

  return fontFiles
}
