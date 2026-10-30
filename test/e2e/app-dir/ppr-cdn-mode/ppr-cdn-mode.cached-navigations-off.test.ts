import { nextTestSetup } from 'e2e-utils'
import { startFakeCDN, type FakeCDN } from '../../../lib/fake-cdn.mjs'
import {
  expectClientStateSurvivesRefresh,
  expectMultipleHolesFillFromOneRequest,
  expectPartialDocumentContract,
  expectServedFromCdn,
  expectServerActionUpdatesPage,
} from './ppr-cdn-mode.cases.util'

// The core cases of ppr-cdn-mode.test.ts, with Cached Navigations turned off.
// It's on by default under Cache Components.
// @force-gate !dev && !vercel
describe('ppr-cdn-mode (Cached Navigations off)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      PPR_CDN_MODE_CACHED_NAVIGATIONS: 'false',
    },
  })

  it('stores a partial page as a complete, cacheable document', async () => {
    await expectPartialDocumentContract(next)
  })

  // The fake CDN listens on a local port.
  // @force-gate !deploy
  describe('behind a caching CDN', () => {
    let cdn: FakeCDN | undefined

    beforeAll(async () => {
      cdn = await startFakeCDN({ destPort: Number(next.appPort) })
    })

    afterAll(async () => {
      await cdn?.close()
    })

    it('serves a partial page from the CDN and fills its hole with one request', async () => {
      await expectServedFromCdn(next, cdn!)
    })
  })

  it('keeps client state in the static part while the refresh fills the hole', async () => {
    await expectClientStateSurvivesRefresh(next)
  })

  it('fills every hole from one dynamic request', async () => {
    await expectMultipleHolesFillFromOneRequest(next)
  })

  it('updates the page from a server action', async () => {
    await expectServerActionUpdatesPage(next)
  })
})
