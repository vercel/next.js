import fs from 'node:fs'
import { retry } from './retry'
import { fetchResource } from './fetch-resource'

/**
 * Fetches a font file and returns its contents as a Buffer.
 * If NEXT_FONT_GOOGLE_MOCKED_RESPONSES is set, we handle mock data logic.
 */
export async function fetchFontFile(url: string, isDev: boolean) {
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    if (url.startsWith('/')) {
      return fs.readFileSync(url)
    }
    return Buffer.from(url)
  }

  return await retry(async () => {
    return fetchResource(
      url,
      isDev,
      `Failed to fetch font file from \`${url}\`.`
    )
  }, 3)
}
