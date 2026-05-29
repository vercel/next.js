import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('getServerSideProps returns notFound: true', () => {
  const { next } = nextTestSetup({
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

  it('should not poll indefinitely', async () => {
    const browser = await next.browser('/')
    await waitFor(3000)
    await browser.close()
    const logOccurrences = next.cliOutput.split('gssp called').length - 1
    expect(logOccurrences).toBe(1)
  })
})
