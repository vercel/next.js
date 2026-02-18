import { nextTestSetup } from 'e2e-utils'

describe('app-dir - max postponed state size', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 413 when next-resume request exceeds max postponed state size', async () => {
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'next-action': 'abc123',
        'next-resume': '1',
      },
      body: Buffer.alloc(1025, 'x'),
    })

    expect(res.status).toBe(413)
    expect(await res.text()).toContain('Postponed state exceeded 1 KB limit.')
  })
})
