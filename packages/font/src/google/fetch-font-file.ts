// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'

/**
 * Fetch the url and return a buffer with the font file.
 */
export async function fetchFontFile(url: string) {
  // Check if we're using mocked data
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    // If it's an absolute path, read the file from the filesystem
    if (url.startsWith('/')) {
      return require('fs').readFileSync(url)
    }
    // Otherwise just return a unique buffer
    return Buffer.from(url)
  }

  const arrayBuffer = await fetch(url).then((r: any) => r.arrayBuffer())
  return Buffer.from(arrayBuffer)
}
