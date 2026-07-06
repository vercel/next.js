import { isNextDev } from 'e2e-utils'
import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp', () => {
  describe('should error when dynamic route is missing generateStaticParams', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set noop',
      expectedErrMsg: isNextDev
        ? 'Page "/another/[slug]/page" is missing exported function "generateStaticParams()", which is required with "output: export" config.'
        : 'Page "/another/[slug]" is missing "generateStaticParams()" so it cannot be used with "output: export" config.',
    })
  })

  describe('should error when client component has generateStaticParams', () => {
    const expectedErrMsg = process.env.IS_TURBOPACK_TEST
      ? 'App pages cannot use both "use client" and export function "generateStaticParams()".'
      : 'Page "/another/[slug]/page" cannot use both "use client" and export function "generateStaticParams()".'

    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set client',
      expectedErrMsg: expectedErrMsg,
    })
  })

  if (isNextDev) {
    describe('should error when dynamic route is set to true', () => {
      runTests({
        dynamicPage: 'undefined',
        dynamicParams: 'true',
        expectedErrMsg:
          '"dynamicParams: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/app/building-your-application/deploying/static-exports',
      })
    })
  }
})
