import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

describe('Turbopack Bootstrap SCSS Windows', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app')),
      dependencies: {
        bootstrap: 'latest',
        sass: 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  // This test verifies that Bootstrap SCSS imports work correctly with Turbopack on Windows
  // The issue was that Sass couldn't resolve imports like @import "variables-dark" from
  // Bootstrap's _variables.scss file. This test ensures the fix works.
  ;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
    'should build successfully with Bootstrap SCSS imports',
    () => {
      it('should build without errors', async () => {
        // If the build succeeded, next instance was created successfully
        expect(next).toBeDefined()
      })

      it('should render the page correctly', async () => {
        const html = await renderViaHTTP(next.url, '/')
        expect(html).toContain('Bootstrap Test')
      })

      it('should apply Bootstrap styles', async () => {
        const html = await renderViaHTTP(next.url, '/')
        // Bootstrap adds specific classes and styles, verify they're present
        expect(html).toMatch(/class.*btn|container|row|col/)
      })
    }
  )
})
