import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

const nodeMajorVersion = Number(process.versions.node.split('.')[0])

createNextDescribe(
  `Isomorphic API routes in ${nodeMajorVersion}`,
  {
    files: __dirname,
    // Vercel does not support isomorphic functions yet
    skipDeployment: true,
  },
  ({ next }) => {
    let stderr = ''

    beforeAll(() => {
      next.on('stderr', (err) => {
        stderr = err
      })
    })

    if (nodeMajorVersion >= 18) {
      it('fullfills a serverless API exposing an isomorphic signature', async () => {
        const response = await fetchViaHTTP(
          next.url,
          '/api/serverless-isomorphic'
        )
        expect(response.status).toEqual(200)
        expect(await response.json()).toMatchObject({ works: true })
      })

      it('fullfills a regular serverless API', async () => {
        const response = await fetchViaHTTP(next.url, '/api/serverless')
        expect(response.status).toEqual(200)
        expect(await response.json()).toMatchObject({ works: true })
      })
    } else {
      it('throws an error when accessing serverless API exposing an isomorphic signature', async () => {
        const response = await fetchViaHTTP(
          next.url,
          '/api/serverless-isomorphic'
        )
        expect(response.status).toEqual(500)
        expect(stderr).toInclude(
          'Error: API routes can only export an edge compliant handler on node.js 18 and later'
        )
      })
    }
  }
)
