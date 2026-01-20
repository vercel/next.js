import { nextTestSetup } from 'e2e-utils'

describe('next-image-abort-internal-image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not keep hanging forever when first request was aborted before response', async () => {
    const $ = await next.render$('/')
    const image = $('#app-image')

    console.log('Fetching first image request...')
    const abortController = new AbortController()
    const firstImageResponsePromise = next.fetch(image.attr('src'), {
      signal: abortController.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    abortController.abort()
    await expect(firstImageResponsePromise).rejects.toThrow(
      /The user aborted a request./
    )

    console.log('Fetching second image request...')
    const secondImageResponse = await next.fetch(image.attr('src'))
    expect(secondImageResponse.status).toBe(200)
  })
})
