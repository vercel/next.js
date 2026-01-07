import { runTests } from './utils'

describe('app dir - with output export - dynamic api route', () => {
  describe.each([
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
    ({ dynamicPage, expectedErrMsg }) => {
      runTests({ dynamicPage, expectedErrMsg })
    }
  )
})
