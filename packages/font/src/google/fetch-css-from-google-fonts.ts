// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'
import { nextFontError } from '../next-font-error'
import { getProxyAgent } from './get-proxy-agent'

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
  // Check if mocked responses are defined, if so use them instead of fetching from Google Fonts
  let mockedResponse: string | undefined
  if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
    const mockFile = require(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES)
    mockedResponse = mockFile[url]
    if (!mockedResponse) {
      nextFontError('Missing mocked response for URL: ' + url)
    }
  }

  let cssResponse: string
  if (mockedResponse) {
    // Just use the mocked CSS if it's set
    cssResponse = mockedResponse
  } else {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      agent: getProxyAgent(),
      // Add a timeout in dev
      signal: isDev ? controller.signal : undefined,
      headers: {
        // The file format is based off of the user agent, make sure woff2 files are fetched
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
      },
    }).finally(() => {
      clearTimeout(timeoutId)
    })

    if (!res.ok) {
      nextFontError(`Failed to fetch font  \`${fontFamily}\`.\nURL: ${url}`)
    }

    cssResponse = await res.text()
  }

  return cssResponse
}
