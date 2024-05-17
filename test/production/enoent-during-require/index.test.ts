import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP, retry } from 'next-test-utils'

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
    await retry(async () => {
      await renderViaHTTP(next.url, '/')
      console.error(next.cliOutput)

      expect(next.cliOutput.includes('non-existent-folder')).toBeTruthy()
    })

    expect(next.cliOutput).not.toContain('Cannot destructure property')
  })
})
