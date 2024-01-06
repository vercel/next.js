import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp dev', () => {
  describe('development mode', () => {
    it('should error when dynamic route is missing generateStaticParams', async () => {
      await runTests({
        isDev: true,
        dynamicPage: 'undefined',
        generateStaticParamsOpt: 'set noop',
        expectedErrMsg:
          'Page "/another/[slug]/page" is missing exported function "generateStaticParams()", which is required with "output: export" config.',
      })
    })

    it('should error when client component has generateStaticParams', async () => {
      await runTests({
        isDev: true,
        dynamicPage: 'undefined',
        generateStaticParamsOpt: 'set client',
        expectedErrMsg:
          'Page "/another/[slug]/page" cannot use both "use client" and export function "generateStaticParams()".',
      })
    })

    it('should error when generateStaticParams returns an empty array', async () => {
      await runTests({
        isDev: true,
        dynamicPage: 'undefined',
        generateStaticParamsOpt: 'set empty',
        expectedErrMsg:
          'Page "/another/[slug]/page"\'s "generateStaticParams()" returned an empty array, which is not allowed with "output: export" config.',
      })
    })
  })
})
