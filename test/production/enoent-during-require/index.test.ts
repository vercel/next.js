import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, renderViaHTTP } from 'next-test-utils'

describe('ENOENT during require', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_app.js': `
          import App from 'next/app'
          
          if (typeof window === 'undefined') {
            if (process.env.NEXT_PHASE !== 'phase-production-build') {
              require('fs').readdirSync('non-existent-folder')
            }
          }
          export default App
        `,
        'pages/index.js': `
          export function getStaticProps() {
            console.log('revalidate /')
            
            return {
              props: {
                now: Date.now()
              },
              revalidate: 1
            }
          }
          
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should show ENOENT error correctly', async () => {
    await check(async () => {
      await renderViaHTTP(next.url, '/')
      console.error(next.cliOutput)

      return next.cliOutput.includes('non-existent-folder')
        ? 'success'
        : next.cliOutput
    }, 'success')

    expect(next.cliOutput).not.toContain('Cannot destructure property')
  })
})
