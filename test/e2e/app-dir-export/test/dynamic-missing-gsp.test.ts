import { isNextDev } from 'e2e-utils'
import { runTests } from './utils'

describe('app dir - with output export - dynamic missing gsp', () => {
  describe('should error when dynamic route is missing generateStaticParams', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set noop',
      expectedErrMsg: isNextDev
        ? 'Page "/another/[slug]/page" is missing exported function "generateStaticParams()", which is required with "output: export" config. See more info here: https://nextjs.org/docs/messages/generate-static-params'
        : 'Page "/another/[slug]" is missing "generateStaticParams()" so it cannot be used with "output: export" config. See more info here: https://nextjs.org/docs/messages/generate-static-params',
    })
  })

  describe('should error when generateStaticParams returns a non-array', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set non-array',
      expectedErrMsg:
        'Invalid value returned from generateStaticParams for "/another/[slug]". Expected an array, but received type object. See more info here: https://nextjs.org/docs/messages/generate-static-params',
    })
  })

  describe('should error when generateStaticParams returns a non-object entry', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set invalid entry',
      expectedErrMsg:
        'Invalid value at index 0 returned from generateStaticParams for "/another/[slug]". Expected an object, but received type null. See more info here: https://nextjs.org/docs/messages/generate-static-params',
    })
  })

  describe('should error when generateStaticParams returns an empty array', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set empty',
      expectedErrMsg:
        'Page "/another/[slug]" returned an empty array from "generateStaticParams()". With "output: export", at least one route must be generated. See more info here: https://nextjs.org/docs/messages/generate-static-params',
    })
  })

  describe('should error when generateStaticParams returns incomplete params', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set wrong param',
      expectedErrMsg:
        'Page "/another/[slug]" returned incomplete params from "generateStaticParams()". With "output: export", every params object must include all dynamic route parameters. Missing: "slug". See more info here: https://nextjs.org/docs/messages/generate-static-params',
    })
  })

  describe('should error when one of the generated params is incomplete', () => {
    runTests({
      dynamicPage: 'undefined',
      generateStaticParamsOpt: 'set mixed params',
      expectedErrMsg:
        'Page "/another/[slug]" returned incomplete params from "generateStaticParams()". With "output: export", every params object must include all dynamic route parameters. Missing: "slug". See more info here: https://nextjs.org/docs/messages/generate-static-params',
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
