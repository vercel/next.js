import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('custom-cache-handler-image', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      // Set max cache entries to 2 to easily test eviction
      MAX_IMAGE_CACHE_ENTRIES: '2',
    },
  })

  if (skipped) {
    return
  }

  it('should use custom cache handler for image optimization', async () => {
    // First, render the page to get the image URLs
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    const smallImgSrc = $('#image-small').attr('src')
    expect(smallImgSrc).toContain('/_next/image')

    // Fetch the optimized image to trigger cache handler
    const imageRes = await next.fetch(smallImgSrc)
    expect(imageRes.status).toBe(200)

    // Verify cache handler was called for the image
    await retry(() => {
      expect(next.cliOutput).toContain('initialized custom cache-handler')
      expect(next.cliOutput).toContain('cache-handler set')
      expect(next.cliOutput).toMatch(/kind:.*IMAGE/)
    })
  })

  it('should evict oldest entries when cache exceeds max size', async () => {
    const $ = await next.render$('/')

    const smallImgSrc = $('#image-small').attr('src')
    const mediumImgSrc = $('#image-medium').attr('src')
    const largeImgSrc = $('#image-large').attr('src')

    // Request all three images sequentially
    // With MAX_IMAGE_CACHE_ENTRIES=2, the first image should be evicted
    // when the third one is added

    // Request image 1 (small)
    await next.fetch(smallImgSrc)
    await retry(() => {
      expect(next.cliOutput).toContain('cache-handler image cache size: 1')
    })

    // Request image 2 (medium)
    await next.fetch(mediumImgSrc)
    await retry(() => {
      expect(next.cliOutput).toContain('cache-handler image cache size: 2')
    })

    // Request image 3 (large) - this should trigger eviction of image 1
    await next.fetch(largeImgSrc)
    await retry(() => {
      expect(next.cliOutput).toContain('cache-handler evicting')
      // Cache size should still be 2 after eviction
      const sizeMatches = next.cliOutput.match(
        /cache-handler image cache size: (\d+)/g
      )
      const lastSize = sizeMatches?.[sizeMatches.length - 1]
      expect(lastSize).toContain('size: 2')
    })
  })

  it('should miss cache for evicted entries', async () => {
    const $ = await next.render$('/')

    const smallImgSrc = $('#image-small').attr('src')
    const mediumImgSrc = $('#image-medium').attr('src')
    const largeImgSrc = $('#image-large').attr('src')

    // Fill the cache and cause eviction
    await next.fetch(smallImgSrc) // Entry 1
    await next.fetch(mediumImgSrc) // Entry 2
    await next.fetch(largeImgSrc) // Entry 3, evicts entry 1

    // Clear output to make assertions cleaner
    const outputBefore = next.cliOutput

    // Request the evicted image again - should be a cache miss
    await next.fetch(smallImgSrc)

    await retry(() => {
      // Get output after the last request
      const newOutput = next.cliOutput.slice(outputBefore.length)
      // Should have a cache miss for the small image (it was evicted)
      expect(newOutput).toContain('cache-handler miss')
      // Should set it again
      expect(newOutput).toContain('cache-handler set')
    })
  })
})
