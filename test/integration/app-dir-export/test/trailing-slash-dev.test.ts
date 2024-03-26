import { runTests } from './utils'

describe('app dir - with output export - trailing slash dev', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      it.each([{ trailingSlash: false }, { trailingSlash: true }])(
        "should work in dev with trailingSlash '$trailingSlash'",
        async ({ trailingSlash }) => {
          await runTests({ isDev: true, trailingSlash })
        }
      )
    }
  )
})
