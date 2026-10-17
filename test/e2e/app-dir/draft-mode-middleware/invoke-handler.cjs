const assert = require('node:assert/strict')
const { handler } = require('./custom-build/server/middleware.js')

async function main() {
  delete process.env.__NEXT_PREVIEW_MODE_ID
  const missing = await handler(
    new Request('http://localhost/preview-page', {
      headers: { cookie: '__prerender_bypass=first-preview-id' },
    }),
    {}
  )
  assert.equal(missing.headers.get('x-draft-mode'), 'disabled')
  await assert.rejects(
    () => handler(new Request('http://localhost/preview-page?draft=true'), {}),
    /previewProps missing previewModeId/
  )

  for (const previewModeId of ['first-preview-id', 'second-preview-id']) {
    const ctx = {
      previewProps: {
        previewModeId,
        previewModeSigningKey: 'test-signing-key',
        previewModeEncryptionKey: 'test-encryption-key',
      },
    }
    const response = await handler(
      new Request('http://localhost/preview-page', {
        headers: { cookie: `__prerender_bypass=${previewModeId}` },
      }),
      ctx
    )
    assert.equal(response.headers.get('x-draft-mode'), 'enabled')

    const enabled = await handler(
      new Request('http://localhost/preview-page?draft=true'),
      ctx
    )
    assert.equal(enabled.headers.get('x-draft-mode'), 'enabled')
    assert.ok(
      enabled.headers
        .get('set-cookie')
        .includes(`__prerender_bypass=${previewModeId}`)
    )
  }

  process.env.__NEXT_PREVIEW_MODE_ID = 'environment-preview-id'
  const fallback = await handler(
    new Request('http://localhost/preview-page', {
      headers: { cookie: '__prerender_bypass=environment-preview-id' },
    }),
    {}
  )
  assert.equal(fallback.headers.get('x-draft-mode'), 'enabled')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
