import { FileRef, nextTestSetup } from 'e2e-utils'
import { sandbox } from 'development-sandbox'
import path from 'path'

describe('ReactRefreshModule', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should allow any variable names', async () => {
    const { session, cleanup } = await sandbox(next)
    expect(await session.hasRedbox()).toBe(false)

    const variables = [
      '_a',
      '_b',
      'currentExports',
      'prevExports',
      'isNoLongerABoundary',
    ]

    for await (const variable of variables) {
      await session.patch(
        'pages/index.js',
        `import { default as ${variable} } from 'next/link'
        console.log({ ${variable} })
        export default function Page() {
          return null
        }`
      )
      expect(await session.hasRedbox()).toBe(false)
      expect(next.cliOutput).not.toContain(
        `'${variable}' has already been declared`
      )
    }

    await cleanup()
  })
})
