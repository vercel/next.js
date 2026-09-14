import { createServerInsertedMetadata } from './create-server-inserted-metadata'

describe('createServerInsertedMetadata', () => {
  it('escapes nonce attribute values in raw HTML output', async () => {
    const getServerInsertedMetadata =
      createServerInsertedMetadata(`" onerror="alert(1)`)

    await expect(getServerInsertedMetadata()).resolves.toContain(
      '<script nonce="&quot; onerror=&quot;alert(1)">'
    )
  })
})
