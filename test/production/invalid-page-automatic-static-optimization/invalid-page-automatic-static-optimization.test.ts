import { nextTestSetup } from 'e2e-utils'

describe('Invalid Page automatic static optimization', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('Fails softly with descriptive error', async () => {
    const { cliOutput } = await next.build()

    expect(cliOutput).toMatch(
      /Build optimization failed: found pages without a React Component as default export in/
    )
    expect(cliOutput).toMatch(/pages\/invalid/)
    expect(cliOutput).toMatch(/pages\/also-invalid/)
  })

  it('handles non-error correctly', async () => {
    await next.patchFile(
      'pages/valid.js',
      `
      export default function Page() {
        return <p>hello world</p>
      }
    `
    )
    await next.patchFile(
      'pages/also-valid.js',
      `
      export default function Page() {
        return <p>hello world</p>
      }
    `
    )
    await next.deleteFile('pages/invalid.js')
    await next.deleteFile('pages/also-invalid.js')
    await next.patchFile(
      'pages/[slug].js',
      `
      export default function Page() {
        return <p>hello world</p>
      }

      export function getStaticPaths() {
        throw 'invalid API token'
      }

      export function getStaticProps() {
        return {
          props: {
            hello: 'world'
          }
        }
      }
    `
    )

    const { cliOutput } = await next.build()
    expect(cliOutput).toMatch(/invalid API token/)
    expect(cliOutput).not.toMatch(/without a React Component/)
  })
})
