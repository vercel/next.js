import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('getServerSideProps returns notFound: true', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
        const Home = () => null
        export default Home
        
        export function getServerSideProps() {
          console.log("gssp called")
          return { notFound: true }
        }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should not poll indefinitely', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      await waitFor(3000)
    } finally {
      await browser.close()
    }

    // Count occurrences of `gssp called` in the output.
    const pattern = /gssp called/g
    const logOccurrences = next.cliOutput.match(pattern)?.length ?? 0
    expect(logOccurrences).toBe(1)
  })
})
