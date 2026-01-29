import { nextTestSetup } from 'e2e-utils'

describe('next-image-abort-internal-image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not hang subsequent requests when first request was aborted before response', async () => {
    const $ = await next.render$('/')
    const image = $('#app-image')
    console.log('Fetching first image request...')
    const abortController = new AbortController()
    const firstImageResponsePromise = next
      .fetch(image.attr('src'), {
        signal: abortController.signal,
      })
      .catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    abortController.abort()
    await firstImageResponsePromise

    console.log('Fetching second image request...')
    const secondImageResponse = await next.fetch(image.attr('src'))

    expect(secondImageResponse.status).toBe(200)
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const responseBuffer = Buffer.from(await secondImageResponse.arrayBuffer())
    const responseSignature = responseBuffer.slice(0, 8)
    expect(responseSignature.equals(pngSignature)).toBe(true)
  })

  it('should still respond to the un-aborted, batched image request when any concurrent request is aborted', async () => {
    const $ = await next.render$('/')
    const image = $('#app-image')
    console.log('Fetching first and second image requests concurrently...')
    const abortController1 = new AbortController()
    const firstImageResponsePromise = next
      .fetch(image.attr('src'), {
        signal: abortController1.signal,
      })
      .catch(() => {})
    const secondImageResponsePromise = next.fetch(image.attr('src'))
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    abortController1.abort()
    await firstImageResponsePromise

    const secondImageResponse = await secondImageResponsePromise

    expect(secondImageResponse.status).toBe(200)
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const responseBuffer = Buffer.from(await secondImageResponse.arrayBuffer())
    const responseSignature = responseBuffer.slice(0, 8)
    expect(responseSignature.equals(pngSignature)).toBe(true)
  })
})
