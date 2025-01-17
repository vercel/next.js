import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check, renderViaHTTP } from 'next-test-utils'

describe('custom-error-500', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export function getServerSideProps() {
            throw new Error('custom error')
          }
          
          export default function Page() {
            return <p>index page</p>
          }
        `,
        'pages/500.js': `
          export default function Custom500() {
            return (
              <>
                <p>pages/500</p>
              </>
            )
          }
        `,
        'pages/_error.js': `
          function Error({ hasError }) {
            return (
              <>
                <p>/_error</p>
              </>
            )
          }
          
          Error.getInitialProps = ({ err }) => {
            console.log(\`called Error.getInitialProps \${!!err}\`)
            return {
              hasError: !!err
            }
          }
          
          export default Error
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should correctly use pages/500 and call Error.getInitialProps', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('pages/500')

    await check(() => next.cliOutput, /called Error\.getInitialProps true/)
  })

  it('should work correctly with pages/404 present', async () => {
    await next.stop()
    await next.patchFile(
      'pages/404.js',
      `
      export default function Page() {
        return <p>custom 404 page</p>
      }
    `
    )
    await next.start()

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('pages/500')

    await check(() => next.cliOutput, /called Error\.getInitialProps true/)
  })
})
