import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

describe('metadata-opengraph-video', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getOgVideoTags(pathname: string) {
    const $ = await next.render$(pathname)
    return {
      videos: $('meta[property="og:video"]')
        .toArray()
        .map((el) => $(el).attr('content')),
      types: $('meta[property="og:video:type"]')
        .toArray()
        .map((el) => $(el).attr('content')),
      images: $('meta[property="og:image"]')
        .toArray()
        .map((el) => $(el).attr('content')),
    }
  }

  it('should render og:video for a static opengraph-video file', async () => {
    const { videos, types, images } = await getOgVideoTags('/')

    // In dev, file based metadata urls are resolved against the dev server
    // origin instead of metadataBase, so only assert the pathname.
    expect(videos).toEqual([
      expect.stringMatching(/^https?:\/\/[^/]+\/opengraph-video\.mp4\?\w+$/),
    ])
    expect(types).toEqual(['video/mp4'])
    // opengraph-image is still collected alongside opengraph-video
    expect(images).toEqual([
      expect.stringMatching(/^https?:\/\/[^/]+\/opengraph-image\.png\?.+$/),
    ])
  })

  it('should serve the opengraph-video file with video content type', async () => {
    const { videos } = await getOgVideoTags('/')
    const { pathname, search } = new URL(videos[0])
    const res = await next.fetch(pathname + search)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    const body = Buffer.from(await res.arrayBuffer())
    expect(
      body.equals(
        fs.readFileSync(path.join(__dirname, 'app/opengraph-video.mp4'))
      )
    ).toBe(true)
  })

  it('should support opengraph-video inside route groups', async () => {
    const { videos, types } = await getOgVideoTags('/grouped')

    expect(videos).toEqual([
      expect.stringMatching(
        /^https?:\/\/[^/]+\/grouped\/opengraph-video-\w{6}\.webm\?\w+$/
      ),
    ])
    expect(types).toEqual(['video/webm'])

    const { pathname } = new URL(videos[0])
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/webm')
  })

  it('should prefer openGraph.videos from metadata over the file convention', async () => {
    const { videos } = await getOgVideoTags('/override')

    expect(videos).toEqual(['https://example.com/custom.mp4'])
  })
})
