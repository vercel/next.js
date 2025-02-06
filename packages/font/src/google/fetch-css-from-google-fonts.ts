import { nextFontError } from '../next-font-error'
import { fetchResource } from './fetch-resource'
import { retry } from './retry'

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
