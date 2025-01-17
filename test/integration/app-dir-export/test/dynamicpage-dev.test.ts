import { runTests } from './utils'

describe('app dir - with output export - dynamic page dev', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      it.each([
        { dynamicPage: 'undefined' },
        { dynamicPage: "'error'" },
        { dynamicPage: "'force-static'" },
        {
          dynamicPage: "'force-dynamic'",
          expectedErrMsg:
            'Page with `dynamic = "force-dynamic"` couldn\'t be exported. `output: "export"` requires all pages be renderable statically',
        },
      ])(
        'should work in dev with dynamicPage $dynamicPage',
        async ({ dynamicPage, expectedErrMsg }) => {
          await runTests({ isDev: true, dynamicPage, expectedErrMsg })
        }
      )
    }
  )
})
