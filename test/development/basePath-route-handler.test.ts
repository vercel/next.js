import { nextTestSetup } from 'e2e-utils'
import path from 'node:path'

const { next } = nextTestSetup({
  files: path.join(__dirname, 'basePath-route-handler'),
})

test('Route Handler should preserve basePath in request.url', async () => {
  const res = await next.fetch('/docs/api/test')
  const text = await res.text()

  expect(text).toContain('/docs/api/test')
})
