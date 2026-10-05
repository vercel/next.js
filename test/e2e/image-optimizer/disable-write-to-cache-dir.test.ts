import { setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
describe('with isrFlushToDisk false config', () => {
  setupTests({
    nextConfigExperimental: { isrFlushToDisk: false },
  })
})
