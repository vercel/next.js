import { nextTestSetup } from 'e2e-utils'

describe('use-cache-binary-args', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  async function renderBytes(hex: string): Promise<string> {
    const $ = await next.render$(`/?bytes=${hex}`)
    return $('#x').text()
  }

  it('should cache binary arguments', async () => {
    const first = await renderBytes('44')
    expect(first.slice(0, 3)).toBe('44-')

    const second = await renderBytes('4400')
    expect(second.slice(0, 5)).toBe('4400-')
    expect(second).not.toBe(first)

    const again = await renderBytes('44')
    expect(again.slice(0, 3)).toBe('44-')
    if (!isNextDeploy) {
      expect(again).toBe(first)
    }

    const other = await renderBytes('45')
    expect(other.slice(0, 3)).toBe('45-')
    expect(other).not.toBe(first)
  })

  async function renderFile(name: string, type: string): Promise<string> {
    const $ = await next.render$(
      `/?bytes=44&name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`
    )
    return $('#f').text()
  }

  it('should include file name and type in the cache key', async () => {
    const first = await renderFile('a.txt', 'text/plain')
    expect(first.slice(0, 17)).toBe('a.txt-text/plain-')

    const renamed = await renderFile('b.txt', 'text/plain')
    expect(renamed.slice(0, 17)).toBe('b.txt-text/plain-')
    expect(renamed).not.toBe(first)

    const retyped = await renderFile('a.txt', 'image/png')
    expect(retyped.slice(0, 16)).toBe('a.txt-image/png-')
    expect(retyped).not.toBe(first)

    const again = await renderFile('a.txt', 'text/plain')
    if (!isNextDeploy) {
      expect(again).toBe(first)
    }
  })
})
