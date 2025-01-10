import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-config-customized', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `
        module.exports = {
          experimental: {
            streamingMetadata: true,
            htmlLimitedBots: /MyBot/i,
          }
        }
      `,
    },
  })

  it('should have the default streaming metadata config output in routes-manifest.json', async () => {
    const requiredServerFiles = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    expect(requiredServerFiles.files).toContain(
      '.next/response-config-manifest.json'
    )
    expect(
      requiredServerFiles.config.experimental.htmlLimitedBots
    ).toMatchInlineSnapshot(`"MyBot"`)

    const responseConfigManifest = JSON.parse(
      await next.readFile('.next/response-config-manifest.json')
    )

    expect(responseConfigManifest).toMatchInlineSnapshot(`
     {
       "htmlLimitedBots": "MyBot",
       "version": 0,
     }
    `)
  })
})
