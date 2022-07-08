import { createNext, FileRef } from 'e2e-utils'
import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware with Dynamic code invocations', () => {
  const DYNAMIC_CODE_EVAL_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Middleware middleware`

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'lib/utils.js': '',
        'lib/square.wasm': new FileRef(join(__dirname, 'square.wasm')),
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
      installCommand: 'yarn install',
    })
    await next.stop()
  })

  afterAll(() => next.destroy())
  beforeEach(() => next.stop())

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
${DYNAMIC_CODE_EVAL_ERROR}`)
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
${DYNAMIC_CODE_EVAL_ERROR}`)
    expect(next.cliOutput).toContain(`
./node_modules/has/src/index.js
${DYNAMIC_CODE_EVAL_ERROR}`)
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
${DYNAMIC_CODE_EVAL_ERROR}`)
  })

  it('does not detects dynamic code nested in @aws-sdk/client-s3 (legit Function.bind)', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import { S3Client, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
        new S3Client().send(new AbortMultipartUploadCommand({}))
      `
    )
    // this previously threw from a module not found error
    // although this is fixed now
    await next.start()

    expect(next.cliOutput).not.toContain(
      `./node_modules/@aws-sdk/smithy-client/dist-es/lazy-json.js`
    )
    expect(next.cliOutput).not.toContain(DYNAMIC_CODE_EVAL_ERROR)
  })

  it('does not determine WebAssembly.instantiate with a module parameter as dynamic code execution (legit)', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        import wasm from './square.wasm?module'
        const instance = WebAssembly.instantiate(wasm)
      `
    )
    await next.start()

    expect(next.cliOutput).not.toContain(DYNAMIC_CODE_EVAL_ERROR)
  })

  // Actually this causes a dynamic code evaluation however, we can't determine the type of
  // first parameter of WebAssembly.instanntiate statically.
  it('does not determine WebAssembly.instantiate with a buffer parameter as dynamic code execution', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        const instance = WebAssembly.instantiate(new Uint8Array([0, 1, 2, 3]))
      `
    )
    await next.start()

    expect(next.cliOutput).not.toContain(DYNAMIC_CODE_EVAL_ERROR)
  })

  it('detects use of WebAssembly.compile', async () => {
    await next.patchFile(
      'lib/utils.js',
      `
        const module = WebAssembly.compile(new Uint8Array([0, 1, 2, 3]))
      `
    )

    await expect(next.start()).rejects.toThrow()
    expect(next.cliOutput).toContain(`
./lib/utils.js
${DYNAMIC_CODE_EVAL_ERROR}`)
  })
})
