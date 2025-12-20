/**
 * Generates alt text from image filename
 * Converts hyphens and underscores to spaces and capitalizes first letter of each word
 */
export function generateAltFromSrc(src: string): string {
  if (!src) return ''

  try {
    const url = new URL(src)

    // For picsum.photos URLs, try to extract the seed parameter which contains the meaningful filename
    if (url.hostname === 'picsum.photos' && url.pathname.startsWith('/seed/')) {
      const seedMatch = url.pathname.match(/\/seed\/([^/]+)/)
      if (seedMatch && seedMatch[1]) {
        return processFilename(seedMatch[1])
      }
    }

    // For other URLs, try to find a meaningful filename
    // Look for the last segment that looks like a filename (has letters, not just numbers)
    const segments = url.pathname.split('/').filter((s) => s.length > 0)

    // Find the last segment that contains letters (not just numbers/dimensions)
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]
      // If segment contains letters and isn't just numbers, use it
      if (/[a-zA-Z]/.test(segment) && !/^\d+$/.test(segment)) {
        return processFilename(segment)
      }
    }

    // Fallback: use last segment
    const filename = segments[segments.length - 1] || ''
    return processFilename(filename)
  } catch {
    // If not a valid URL, fall back to simple filename extraction
    const filename = src.split('/').pop() || ''
    return processFilename(filename)
  }
}

function processFilename(filename: string): string {
  if (!filename) return ''
  const nameWithoutExtension = filename.split('.')[0]
  if (!nameWithoutExtension) return ''

  return nameWithoutExtension
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
