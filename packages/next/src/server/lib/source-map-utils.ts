/**
 * Pure string utilities for source map path normalization.
 * No Node.js dependencies - safe to import in browser bundles.
 */

/**
 * Normalize source URLs that were incorrectly formed by source-map resolution.
 *
 * Fixes two issues:
 *
 * 1. **file:/ URL concatenation bug in source-map library**
 *    The source-map library (v0.6.1) doesn't recognize `file:/` (single slash) as an
 *    absolute URL, so when a source map has `sourceRoot: "../../../"` and
 *    `sources: ["file:/Users/foo/app/page.js"]`, the library incorrectly concatenates
 *    them into `../../../file:/Users/foo/app/page.js`.
 *    We extract the last `file:/` occurrence and normalize it to `file:///`.
 *    See: https://github.com/nicolo-ribaudo/source-map/issues/1
 *
 * 2. **Duplicate path segments**
 *    Some bundler/compiler combinations can produce paths with duplicate directory
 *    sequences like `app/components/app/components/Button.js`. We detect and remove
 *    the first occurrence of repeated segments.
 */
export function normalizeSourceUrl(source: string): string {
  let result = source

  // Fix 1: Handle file:/ URL that was incorrectly concatenated with sourceRoot.
  // Find the last occurrence of file:/ since that's the actual source path.
  const lastFileUrlIndex = result.lastIndexOf('file:/')
  if (lastFileUrlIndex > 0) {
    // Only extract if file:/ is NOT at the beginning (meaning it was concatenated)
    let fileUrl = result.slice(lastFileUrlIndex)
    // Normalize file:/ (single slash) to file:/// (canonical form with empty host)
    if (!fileUrl.startsWith('file://')) {
      fileUrl = 'file://' + fileUrl.slice(5) // 'file:/' is 5 chars, replace with 'file://'
    }
    result = fileUrl
  } else if (lastFileUrlIndex === 0 && !result.startsWith('file://')) {
    // Handle file:/ at the beginning that needs normalization to file://
    result = 'file://' + result.slice(5)
  }

  // Fix 2: Handle duplicate path segments (e.g., test/foo/test/foo/file.js -> test/foo/file.js)
  // This also applies to file:// URLs with duplicate paths
  // Algorithm: Find the shortest repeated sequence of path segments and remove the duplicate.
  const parts = result.split('/')
  for (let len = 1; len <= parts.length / 2; len++) {
    for (let i = 0; i <= parts.length - len * 2; i++) {
      // Check if parts[i..i+len] equals parts[i+len..i+len*2]
      let match = true
      for (let j = 0; j < len; j++) {
        if (parts[i + j] !== parts[i + len + j]) {
          match = false
          break
        }
      }
      // Don't treat '..' or '.' or empty string as duplicates (e.g., ../../foo is valid)
      // Empty string can appear in file:// URLs (file:///Users -> ['file:', '', '', 'Users'])
      if (match && parts[i] !== '..' && parts[i] !== '.' && parts[i] !== '') {
        // Remove the duplicate segment by keeping [0..i+len] and [i+len*2..end]
        const newParts = [
          ...parts.slice(0, i + len),
          ...parts.slice(i + len * 2),
        ]
        return newParts.join('/')
      }
    }
  }

  return result
}
