import { runTests } from './utils'

describe('app dir - with output export - dynamic api route prod', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it.each([
      { dynamicPage: 'undefined' },
      { dynadynamicPagemic: "'error'" },
      { dynamicPage: "'force-static'" },
      {
        dynamicPage: "'force-dynamic'",
        expectedErrMsg:
          'Page with `dynamic = "force-dynamic"` couldn\'t be rendered statically because it used `output: export`.',
      },
    ])(
      'should work in prod with dynamicPage $dynamicPage',
      async ({ dynamicPage, expectedErrMsg }) => {
        await runTests({ isDev: false, dynamicPage, expectedErrMsg })
      }
    )
  })
})
