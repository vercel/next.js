import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware with Dynamic code invokations', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'lib/utils.js': '',
        'pages/index.js': `
          export default function () { return <div>Hello, world!</div> }
        `,
        'middleware.js': `
          import './lib/utils'
          export default function middleware() {
            return new Response()
          }
        `,
      },
      dependencies: {
        '@apollo/react-hooks': '3.1.5',
        '@aws-sdk/client-s3': 'latest',
        'apollo-client': 'latest',
        graphql: 'latest',
        'graphql-tag': 'latest',
        has: 'latest',
        qs: 'latest',
      },
    })
    await next.stop()
  })

  afterAll(() => next.destroy())

  it('detects dynamic code nested in @apollo/react-hooks', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import { useQuery } from '@apollo/react-hooks'
        import gql from 'graphql-tag'

        export default function useGreeting() {
          return useQuery(
            gql\`
              query getGreeting($language: String!) {
                greeting(language: $language) {
                  message
                }
              }
            \`, 
            { variables: { language: 'english' } }
          )
        }
      `
    )
    await expect(next.start()).rejects.toThrow()
    expect(next.cliOutput).toContain(`
./node_modules/ts-invariant/lib/invariant.esm.js
Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware middleware`)
  })

  it('detects dynamic code nested in has', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import has from 'has'
        has(Object.prototype, 'hasOwnProperty')
      `
    )
    await expect(next.start()).rejects.toThrow()
    expect(next.cliOutput).toContain(`
./node_modules/function-bind/implementation.js
Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware middleware`)
    expect(next.cliOutput).toContain(`
./node_modules/has/src/index.js
Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware middleware`)
  })

  it('detects dynamic code nested in qs', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import qs from 'qs'
        qs.parse('a=c')
      `
    )
    await expect(next.start()).rejects.toThrow()
    expect(next.cliOutput).toContain(`
./node_modules/get-intrinsic/index.js
Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware middleware`)
  })

  it('does not detects dynamic code nested in @aws-sdk/client-s3 (legit Function.bind)', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import { S3Client, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
        new S3Client().send(new AbortMultipartUploadCommand({}))
      `
    )
    await expect(next.start()).rejects.toThrow()
    expect(next.cliOutput).not.toContain(
      `./node_modules/@aws-sdk/smithy-client/dist-es/lazy-json.js`
    )
    expect(next.cliOutput).not.toContain(
      `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware middleware`
    )
  })
})
