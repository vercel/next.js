import { nextFontError } from '../next-font-error'
import { fetchResource } from './fetch-resource'
import { retry } from './retry'

/**
 * Fetches the CSS containing the @font-face declarations from Google Fonts.
 * The fetch has a user agent header with a modern browser to ensure we'll get .woff2 files.
 *
 * The env variable NEXT_FONT_GOOGLE_MOCKED_RESPONSES may be set containing a path to mocked data.
 * It's used to define mocked data to avoid hitting the Google Fonts API during tests.
 */
export async function fetchCSSFromGoogleFonts(
  url: string,
  fontFamily: string,
  isDev: boolean
): Promise<string> {
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    const mockFile = require(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES)
    const mockedResponse = mockFile[url]
    if (!mockedResponse) {
      nextFontError('Missing mocked response for URL: ' + url)
    }
    return mockedResponse
  }

  const buffer = await retry(async () => {
    return fetchResource(
      url,
      isDev,
      `Failed to fetch font \`${fontFamily}\`: ${url}\n` +
        `Please check your network connection.`
    )
  }, 3)

  return buffer.toString('utf8')
}
