import { setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
describe('with dangerouslyAllowSVG config', () => {
  setupTests({
    nextConfigImages: { dangerouslyAllowSVG: true },
  })
})
