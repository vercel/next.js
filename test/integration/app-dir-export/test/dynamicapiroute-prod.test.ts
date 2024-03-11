import { runTests } from './utils'

describe('app dir - with output export - dynamic api route prod', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
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
      'should work in prod with dynamicApiRoute $dynamicApiRoute',
      async ({ dynamicApiRoute, expectedErrMsg }) => {
        await runTests({ isDev: false, dynamicApiRoute, expectedErrMsg })
      }
    )
  })
})
