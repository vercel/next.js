import { getProxyAgent } from './get-proxy-agent'

/**
 * Fetch the url and return a buffer with the font file.
 */
export async function fetchFontFile(url: string, isDev: boolean) {
  // Check if we're using mocked data
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    // If it's an absolute path, read the file from the filesystem
    if (url.startsWith('/')) {
      return require('fs').readFileSync(url)
    }
    // Otherwise just return a unique buffer
    return Buffer.from(url)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)
  const arrayBuffer = await fetch(url, {
    // @ts-expect-error `undici`/Node.js type mismatch with the Web API
    dispatcher: getProxyAgent(),
    // Add a timeout in dev
    signal: isDev ? controller.signal : undefined,
  })
    .then((r: any) => r.arrayBuffer())
    .finally(() => {
      clearTimeout(timeoutId)
    })
  return Buffer.from(arrayBuffer)
}
