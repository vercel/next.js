import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

describe('Turbopack Route Handler notFound', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app')),
    })
  })
  afterAll(() => next.destroy())

  // This test verifies that Route Handlers with notFound() build successfully with Turbopack
  // The issue was that Turbopack couldn't parse app-router-context module during build.
  // This test ensures the fix works.
  ;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
    'should build successfully with Route Handler using notFound()',
    () => {
      it('should build without errors', async () => {
        // If the build succeeded, next instance was created successfully
        expect(next).toBeDefined()
      })

      it('should return 404 when Route Handler calls notFound()', async () => {
        const res = await next.fetch('/api/not-found')
        expect(res.status).toBe(404)
        expect(await res.text()).toBe('')
      })
    }
  )
})
