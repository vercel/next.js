import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// This test verifies a case when the "proxy.ts" bundle is being traced into the NFT file.
// As the webpack build outputs it as "middleware.js", the NFT file has to list it under that name.
// Otherwise it will fail for the providers like Vercel that checks for the files in NFT.

describe('proxy-nfc-traced', () => {
  const { next, isTurbopack, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // 'middleware.js' won't be traced because Turbopack doesn't bundle all code to .next/server/middleware.js
  if (isNextStart && !isTurbopack) {
    it('should list the trace file as middleware and not as proxy', async () => {
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
