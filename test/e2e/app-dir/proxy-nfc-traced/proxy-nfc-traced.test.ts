import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// This test verifies a case when the "proxy.ts" bundle is being traced into the NFT file as "proxy.js".
// As Next.js renames "proxy.js" to "middleware.js" during webpack build, the files in NFT will differ
// from the actual outputs, which will fail for the providers like Vercel that checks for the files in NFT.

describe('proxy-nfc-traced', () => {
  const { next, isTurbopack, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // 'middleware.js' won't be traced because Turbopack doesn't bundle all code to .next/server/middleware.js
  if (isNextStart && !isTurbopack) {
    it('should have renamed trace file as middleware instead of proxy', async () => {
      const nfc = JSON.parse(
        fs.readFileSync(
          path.join(next.testDir, '.next/server/middleware.js.nft.json'),
          'utf-8'
        )
      )
      expect(nfc.files).toContain('middleware.js')
      expect(nfc.files).not.toContain('proxy.js')
    })
  }

  // Previously, the deployment tests failed because of the traced file name mismatch.
  it('should successfully build and be redirected from proxy', async () => {
    const $ = await next.render$('/home')
    expect($('p').text()).toBe('hello world')
  })
})
