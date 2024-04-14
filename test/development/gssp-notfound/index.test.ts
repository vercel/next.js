import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
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
    const browser = await webdriver(next.url, '/')
    await waitFor(3000)
    await browser.close()
    const logOccurrences = next.cliOutput.split('gssp called').length - 1
    expect(logOccurrences).toBe(1)
  })
})
