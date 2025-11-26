/* eslint-env jest */
import path from 'path'
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic metadata error', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should error when id is missing in generateImageMetadata', async () => {
    const iconFilePath = 'app/metadata-base/unset/icon.tsx'
    const contentMissingIdProperty = `
    import { ImageResponse } from 'next/og'
    export async function generateImageMetadata() {
      return [
        {
          contentType: 'image/png',
          size: { width: 48, height: 48 },
          // id: 100,
        },
        {
          contentType: 'image/png',
          size: { width: 48, height: 48 },
          id: 101,
        },
      ]
    }
  
    export default function icon() {
      return new ImageResponse(<div>icon</div>)
    }
    `
    await using _sandbox = await createSandbox(
      next,
      new Map([[iconFilePath, contentMissingIdProperty]]),
      '/metadata-base/unset/icon/100'
    )

    await retry(async () => {
      expect(next.cliOutput).toContain(
        `id property is required for every item returned from generateImageMetadata`
      )
    })
  })

  it('should error when id is missing in generateSitemaps', async () => {
    const sitemapFilePath = 'app/metadata-base/unset/sitemap.tsx'
    const contentMissingIdProperty = `
    import { MetadataRoute } from 'next'
  
    export async function generateSitemaps() {
      return [
        { },
      ]
    }
  
    export default function sitemap({ id }): MetadataRoute.Sitemap {
      return [
        {
          url: 'https://example.com/',
          lastModified: '2021-01-01',
        },
      ]
    }`

    await using _sandbox = await createSandbox(
      next,
      new Map([[sitemapFilePath, contentMissingIdProperty]]),
      '/metadata-base/unset/sitemap/100.xml'
    )

    await retry(async () => {
      expect(next.cliOutput).toContain(
        `id property is required for every item returned from generateSitemaps`
      )
    })
  })

  it('should error if the default export of dynamic image is missing', async () => {
    const ogImageFilePath = 'app/opengraph-image.tsx'
    const ogImageFileContentWithoutDefaultExport = `
    // Missing default export
    export function foo() {}  
    `

    await using _sandbox = await createSandbox(
      next,
      new Map([[ogImageFilePath, ogImageFileContentWithoutDefaultExport]]),
      '/opengraph-image'
    )
    await retry(async () => {
      expect(next.cliOutput).toContain(`Default export is missing in`)
    })
  })
})
