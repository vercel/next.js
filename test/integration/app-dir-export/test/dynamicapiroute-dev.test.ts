import { runTests } from './utils'

it.each([
  { dynamicApiRoute: 'undefined' },
  { dynamicApiRoute: "'error'" },
  { dynamicApiRoute: "'force-static'" },
  {
    dynamicApiRoute: "'force-dynamic'",
    expectedErrMsg:
      'export const dynamic = "force-dynamic" on page "/api/json" cannot be used with "output: export".',
  },
])(
  'should work in dev with dynamicApiRoute $dynamicApiRoute',
  async ({ dynamicApiRoute, expectedErrMsg }) => {
    await runTests({ isDev: true, dynamicApiRoute, expectedErrMsg })
  }
)
