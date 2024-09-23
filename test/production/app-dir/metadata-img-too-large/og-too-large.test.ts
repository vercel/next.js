import { nextTestSetup } from 'e2e-utils'

describe('og-too-large', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn when twitter-image file size exceeds 5MB', async () => {
    const { cliOutput } = next
    expect(cliOutput).toContain(
      'File size for Twitter image "app/twitter-image.png" exceeds 5MB. (Current: 5.23MB)'
    )
  })
})
