import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

describe('app-root-params - dynamicIO', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'dynamic-io'),
    skipStart: isPPREnabled,
    skipDeployment: isPPREnabled,
  })

  // TODO: We need to figure out how to handle cached root params when
  // generating a PPR fallback shell.
  if (isPPREnabled) {
    it('is not currently enabled', () => {})
  } else {
    it('should prerender pages when using rootParams in generateStaticParams', async () => {
      const $ = await next.render$('/en/us')
      expect($('#param').text()).toBe('en us')
      const initialRandom = $('#random').text()
      expect(initialRandom).toMatch(/0(\.\d+)?$/)

      const $2 = await next.render$('/en/us')
      expect($2('#param').text()).toBe('en us')
      const random = $2('#random').text()
      expect(random).toBe(initialRandom)
    })
  }
})
