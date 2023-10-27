import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp prod', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should error when dynamic route is missing generateStaticParams', async () => {
      await runTests({
        isDev: false,
        dynamicPage: 'undefined',
        generateStaticParamsOpt: 'set noop',
        expectedErrMsg:
          'Page "/another/[slug]" is missing "generateStaticParams()" so it cannot be used with "output: export" config.',
      })
    })

    it('should error when client component has generateStaticParams', async () => {
      await runTests({
        isDev: false,
        dynamicPage: 'undefined',
        generateStaticParamsOpt: 'set client',
        expectedErrMsg:
          'Page "/another/[slug]/page" cannot use both "use client" and export function "generateStaticParams()".',
      })
    })
  })
})
