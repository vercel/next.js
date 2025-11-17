import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp prod', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
        const expectedErrMsg = process.env.IS_TURBOPACK_TEST
          ? 'App pages cannot use both "use client" and export function "generateStaticParams()".'
          : 'Page "/another/[slug]/page" cannot use both "use client" and export function "generateStaticParams()".'

        await runTests({
          isDev: false,
          dynamicPage: 'undefined',
          generateStaticParamsOpt: 'set client',
          expectedErrMsg: expectedErrMsg,
        })
      })
    }
  )
})
