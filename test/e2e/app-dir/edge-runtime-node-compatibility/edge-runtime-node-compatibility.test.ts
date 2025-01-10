import { nextTestSetup } from 'e2e-utils'

describe('edge runtime node compatibility', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('[app] supports node:buffer', async () => {
    const res = await next.fetch('/buffer', {
      method: 'POST',
      body: 'Hello, world!',
    })
    const json = await res.json()
    expect(json).toEqual({
      'Buffer === B.Buffer': true,
      encoded: Buffer.from('Hello, world!').toString('base64'),
      exposedKeys: expect.arrayContaining([
        'constants',
        'kMaxLength',
        'kStringMaxLength',
        'Buffer',
        'SlowBuffer',
      ]),
    })
  })

  it('[pages/api] supports node:buffer', async () => {
    const res = await next.fetch('/api/buffer', {
      method: 'POST',
      body: 'Hello, world!',
    })
    const json = await res.json()
    expect(json).toEqual({
      'B2.Buffer === B.Buffer': true,
      'Buffer === B.Buffer': true,
      'typeof B.Buffer': 'function',
      'typeof B2.Buffer': 'function',
      'typeof Buffer': 'function',
      encoded: 'SGVsbG8sIHdvcmxkIQ==',
      exposedKeys: expect.arrayContaining([
        'constants',
        'kMaxLength',
        'kStringMaxLength',
        'Buffer',
        'SlowBuffer',
      ]),
    })
  })
})
