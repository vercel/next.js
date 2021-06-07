import * as Log from '../../build/output/log'
import { GOOGLE_FONT_PROVIDER } from '../lib/constants'
const https = require('https')

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'
const IE_UA = 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko'

export type FontManifest = Array<{
  url: string
  content: string
}>

function isGoogleFont(url: string): boolean {
  return url.startsWith(GOOGLE_FONT_PROVIDER)
}

function getFontForUA(url: string, UA: string): Promise<String> {
  return new Promise((resolve, reject) => {
    let rawData: any = ''
    https
      .get(
        url,
        {
          headers: {
            'user-agent': UA,
          },
        },
        (res: any) => {
          res.on('data', (chunk: any) => {
            rawData += chunk
          })
          res.on('end', () => {
            resolve(rawData.toString('utf8'))
          })
        }
      )
      .on('error', (e: Error) => {
        reject(e)
      })
  })
}

export async function getFontDefinitionFromNetwork(
  url: string
): Promise<string> {
  let result = ''
  /**
   * The order of IE -> Chrome is important, other wise chrome starts loading woff1.
   * CSS cascading 🤷‍♂️.
   */
  try {
    if (isGoogleFont(url)) {
      result += await getFontForUA(url, IE_UA)
    }
    result += await getFontForUA(url, CHROME_UA)
  } catch (e) {
    Log.warn(
      `Failed to download the stylesheet for ${url}. Skipped optimizing this font.`
    )
    return ''
  }

  return result
}

export function getFontDefinitionFromManifest(
  url: string,
  manifest: FontManifest
): string {
  return (
    manifest.find((font) => {
      if (font && font.url === url) {
        return true
      }
      return false
    })?.content || ''
  )
}
