import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp dev', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
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
        const expectedErrMsg = process.env.TURBOPACK_DEV
          ? 'Page "test/integration/app-dir-export/app/another/[slug]/page.js" cannot use both "use client" and export function "generateStaticParams()".'
          : 'Page "/another/[slug]/page" cannot use both "use client" and export function "generateStaticParams()".'
        await runTests({
          isDev: true,
          dynamicPage: 'undefined',
          generateStaticParamsOpt: 'set client',
          expectedErrMsg,
        })
      })
    }
  )
})
