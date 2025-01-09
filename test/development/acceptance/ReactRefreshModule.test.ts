import { FileRef, nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'
import path from 'path'

describe('ReactRefreshModule', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should allow any variable names', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox
    await session.assertNoRedbox()

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
      await session.assertNoRedbox()
      expect(next.cliOutput).not.toContain(
        `'${variable}' has already been declared`
      )
    }
  })
})
