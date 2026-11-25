import { setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
describe('with contentDispositionType inline', () => {
  setupTests({
    nextConfigImages: { contentDispositionType: 'inline' },
  })
})
