import { nextTestSetup } from 'e2e-utils'

describe('hello-world', () => {
  const { next } = nextTestSetup({
    dependencies: {
      'babel-plugin-react-compiler': '0.0.0-experimental-e1e972c-20250221',
    },
    files: __dirname,
  })

  it('should have correct filepaths', async () => {
    const browser = await next.browser('/')
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "Error: Boom!",
       "environmentLabel": null,
       "label": "Console Error",
       "source": null,
       "stack": [
         "<FIXME-file-protocol>",
       ],
     }
    `)
  })
})
