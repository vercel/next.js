import { runTests } from './utils'

it.each([
  { isDev: true, dynamic: 'undefined' },
  { isDev: true, dynamic: "'error'" },
  { isDev: true, dynamic: "'force-static'" },
  {
    isDev: true,
    dynamic: "'force-dynamic'",
    expectedErrMsg:
      'Page with `dynamic = "force-dynamic"` couldn\'t be rendered statically because it used `output: export`.',
  },
  { isDev: false, dynamic: 'undefined' },
  { isDev: false, dynamic: "'error'" },
  { isDev: false, dynamic: "'force-static'" },
  {
    isDev: false,
    dynamic: "'force-dynamic'",
    expectedErrMsg:
      'Page with `dynamic = "force-dynamic"` couldn\'t be rendered statically because it used `output: export`.',
  },
])(
  "should work with with isDev '$isDev' and dynamic $dynamic on page",
  async ({ isDev, dynamic, expectedErrMsg }) => {
    await runTests({ isDev, dynamicPage: dynamic, expectedErrMsg })
  }
)

it.each([
  { isDev: true, dynamic: 'undefined' },
  { isDev: true, dynamic: "'error'" },
  { isDev: true, dynamic: "'force-static'" },
  {
    isDev: true,
    dynamic: "'force-dynamic'",
    expectedErrMsg:
      'export const dynamic = "force-dynamic" on page "/api/json" cannot be used with "output: export".',
  },
  { isDev: false, dynamic: 'undefined' },
  { isDev: false, dynamic: "'error'" },
  { isDev: false, dynamic: "'force-static'" },
  {
    isDev: false,
    dynamic: "'force-dynamic'",
    expectedErrMsg:
      'export const dynamic = "force-dynamic" on page "/api/json" cannot be used with "output: export".',
  },
])(
  "should work with with isDev '$isDev' and dynamic $dynamic on route handler",
  async ({ isDev, dynamic, expectedErrMsg }) => {
    await runTests({ isDev, dynamicApiRoute: dynamic, expectedErrMsg })
  }
)
