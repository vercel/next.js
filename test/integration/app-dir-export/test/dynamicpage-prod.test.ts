import { runTests } from './utils'

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
