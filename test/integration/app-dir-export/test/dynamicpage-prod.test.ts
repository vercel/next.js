import { runTests } from './utils'

describe('app dir - with output export - dynamic api route prod', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
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
        'should work in prod with dynamicPage $dynamicPage',
        async ({ dynamicPage, expectedErrMsg }) => {
          await runTests({ isDev: false, dynamicPage, expectedErrMsg })
        }
      )
    }
  )
})
