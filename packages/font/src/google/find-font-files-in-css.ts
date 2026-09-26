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
    // The format('...') hint from the same `src:` line, if present.
    // Google Fonts sometimes returns URLs without a file extension
    // (e.g. https://fonts.gstatic.com/l/font?kit=...), in which case the
    // format hint is used to determine the font file extension.
    format: string | undefined
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
      const format = /format\(['"](.+?)['"]\)/.exec(line)?.[1]
      if (
        googleFontFileUrl &&
        !fontFiles.some(
          (foundFile) => foundFile.googleFontFileUrl === googleFontFileUrl
        )
      ) {
        // Found the font file in the @font-face declaration.
        fontFiles.push({
          googleFontFileUrl,
          preloadFontFile: !!subsetsToPreload?.includes(currentSubset),
          format,
        })
      }
    }
  }

  return fontFiles
}
