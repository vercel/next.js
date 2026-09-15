import { nextTestSetup } from 'e2e-utils'

const jsContent = `export const nope = 'nope'

throw new Error('please dont execute me')
`

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
// @force-gate turbopack
describe('turbopack-import-with-type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Testing this together on one route ensures we also avoid weird duplicate module ident things
  it('supports import with type: text, type: bytes, and type: json', async () => {
    const response = JSON.parse(await next.render('/api'))
    expect(response).toEqual({
      text: {
        typeofString: true,
        length: 12,
        content: 'hello world\n',
      },
      jsAsText: {
        typeofString: true,
        content: jsContent,
      },
      bytes: {
        instanceofUint8Array: true,
        length: 18,
        content: 'this is some data\n',
      },
      jsAsBytes: {
        instanceofUint8Array: true,
        content: jsContent,
      },
      configuredAsJsAsBytes: {
        instanceofUint8Array: true,
        content:
          "throw new Error('this file is configured as ecmascript but imported as bytes')\n",
      },
      json: {
        typeofObject: true,
        content: { hello: 'world' },
      },
      jsonAsText: {
        typeofString: true,
        content: '{ "hello": "world" }\n',
      },
    })
  })
})
