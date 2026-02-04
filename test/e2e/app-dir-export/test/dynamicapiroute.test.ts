import { runTests } from './utils'

describe('app dir - with output export - dynamic api route', () => {
  describe.each([
    {
      dynamicApiRoute: 'undefined',
      expectedErrMsg:
        'export const dynamic = "force-static"/export const revalidate not configured on route',
    },
    { dynamicApiRoute: "'error'" },
    { dynamicApiRoute: "'force-static'" },
    {
      dynamicApiRoute: "'force-dynamic'",
      expectedErrMsg:
        'export const dynamic = "force-dynamic" on page "/api/json" cannot be used with "output: export".',
    },
  ])(
    'should work in prod with dynamicApiRoute $dynamicApiRoute',
    ({ dynamicApiRoute, expectedErrMsg }) => {
      runTests({ dynamicApiRoute, expectedErrMsg })
    }
  )
})
