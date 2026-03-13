import { nextTestSetup } from 'e2e-utils'

describe('metadata-base-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not warn metadataBase for static image when metadataBase is set', async () => {
    expect(next.cliOutput).not.toContain(
      'metadataBase property in metadata export is not set for resolving social open graph or twitter images'
    )
  })
})
