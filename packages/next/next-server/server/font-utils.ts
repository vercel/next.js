const https = require('https')

export type FontManifest = Array<{
  url: string
  content: string
}>

export function getFontDefinitionFromNetwork(url: string): Promise<string> {
  return new Promise((resolve) => {
    let rawData: any = ''
    https.get(
      url,
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36',
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
  })
}

export function getFontDefinitionFromManifest(
  url: string,
  manifest: FontManifest
): string {
  let fontContent = ''
  manifest.forEach((font: any) => {
    if (font && font.url === url) {
      fontContent = font.content
    }
  })
  return fontContent
}
