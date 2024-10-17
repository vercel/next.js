import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { sandbox } from 'development-sandbox'

describe('Undefined default export', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  it('should error if page component does not have default export', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        ['app/(group)/specific-path/server/page.js', 'export const a = 123'],
      ]),
      '/specific-path/server'
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in "/specific-path/server/page"'
    )

    await cleanup()
  })

  it('should error if not-found component does not have default export when trigger not-found boundary', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'app/will-not-found/page.js',
          `
          import { notFound } from 'next/navigation'
          export default function Page() { notFound() }
          `,
        ],
        ['app/will-not-found/not-found.js', 'export const a = 123'],
      ]),
      '/will-not-found'
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in "/will-not-found/not-found"'
    )

    await cleanup()
  })

  it('should error when page component export is not valid', async () => {
    const { session, cleanup } = await sandbox(
      next,
      undefined,
      '/server-with-errors/page-export'
    )

    await next.patchFile(
      'app/server-with-errors/page-export/page.js',
      'export const a = 123'
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in "/server-with-errors/page-export/page"'
    )

    await cleanup()
  })

  it('should error when page component export is not valid on initial load', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'app/server-with-errors/page-export-initial-error/page.js',
          'export const a = 123',
        ],
      ]),
      '/server-with-errors/page-export-initial-error'
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toInclude(
      'The default export is not a React Component in "/server-with-errors/page-export-initial-error/page"'
    )

    await cleanup()
  })
})
