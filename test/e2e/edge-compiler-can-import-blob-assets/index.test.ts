import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Edge Compiler can import blob assets', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('allows to fetch the blobs', async () => {
    const html = await renderViaHTTP(next.url, '/api/edge', {
      handler: 'text-file',
    })
    expect(html).toContain('Hello, from text-file.txt!')
  })
})
