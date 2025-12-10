import { nextTestSetup } from 'e2e-utils'

describe('app-dir - no server actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should log when triggering a fetch action on an app with no server actions', async () => {
    await next.fetch('/', {
      method: 'POST',
      headers: {
        'Next-Action': 'abc123',
      },
    })

    expect(next.cliOutput).toContain(
      'Failed to find Server Action "abc123". This request might be from an older or newer deployment.'
    )
  })

  it('should log when triggering an MPA action on an app with no server actions', async () => {
    const formData = new FormData()
    formData.append('test', 'value')

    await next.fetch('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // @ts-expect-error: node-fetch types don't seem to like FormData
      body: formData,
    })

    expect(next.cliOutput).toContain(
      'Failed to find Server Action. This request might be from an older or newer deployment.'
    )
  })
})
