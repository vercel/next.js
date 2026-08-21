import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe.each([
  { decoratorVersion: 'legacy', experimentalDecorators: false },
  { decoratorVersion: '2021-12', experimentalDecorators: false },
  { decoratorVersion: '2022-03', experimentalDecorators: false },
  { decoratorVersion: '2022-03', experimentalDecorators: true },
] as const)(
  'decoratorVersion: $decoratorVersion, experimentalDecorators: $experimentalDecorators',
  ({ decoratorVersion, experimentalDecorators }) => {
    const { next } = nextTestSetup({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
        'tsconfig.json': new FileRef(
          join(
            __dirname,
            experimentalDecorators
              ? 'tsconfig-experimental-decorators.json'
              : 'tsconfig.json'
          )
        ),
        'next.config.js': new FileRef(
          join(__dirname, 'configs', `${decoratorVersion}.js`)
        ),
      },
    })

    it(`should support ${decoratorVersion} decorators`, async () => {
      const response = await next.fetch('/api/hello')

      await expect(response.json()).resolves.toEqual({
        text: 'hello world',
      })
    })
  }
)
