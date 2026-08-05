import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-dir action malformed origin', () => {
  const { next, skipped } = nextTestSetup({
    files: join(__dirname, 'unsafe-origins'),
    skipDeployment: true,
    dependencies: {
      'server-only': 'latest',
    },
  })

  if (skipped) {
    return
  }

  async function postWithMalformedOrigin(origin: string) {
    const outputIndex = next.cliOutput.length

    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=----PoC',
        origin,
      },
      body: '------PoC--\r\n',
    })

    const output = next.cliOutput.slice(outputIndex)

    expect(output).not.toContain('TypeError: Invalid URL')
    expect(output).not.toContain('Missing `origin` header')
    expect(output).toContain('Invalid Server Actions request.')

    return res
  }

  it('should reject multipart action requests with http:// origin without throwing', async () => {
    await postWithMalformedOrigin('http://')
  })

  it('should reject multipart action requests with non-URL origin without throwing', async () => {
    await postWithMalformedOrigin('not-a-url')
  })

  it('should keep serving pages after malformed origin requests', async () => {
    await postWithMalformedOrigin('http://')

    const res = await next.fetch('/')

    expect(res.status).toBe(200)
  })
})
