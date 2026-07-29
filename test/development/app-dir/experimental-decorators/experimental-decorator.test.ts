import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe).each([
  'legacy',
  '2021-12',
  '2022-03',
] as const)('decoratorVersion: %s', (decoratorVersion) => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'pages')),
      'tsconfig.json': new FileRef(join(__dirname, 'tsconfig.json')),
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
})
