import { createNextDescribe } from 'e2e-utils'

import cookies from './cookies'

createNextDescribe(
  'set-cookies',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe.each(['edge', 'experimental-edge', 'node'])(
      'for %s runtime',
      (runtime) => {
        describe.each(['pages', 'app'])('for /%s', (dir) => {
          it('should set two set-cookie headers', async () => {
            const res = await next.fetch(`/api/${dir}/${runtime}`)

            const headers: ReadonlyArray<string> =
              res.headers.getSetCookie?.() ?? res.headers.raw()['set-cookie']

            expect(headers).toHaveLength(2)
            expect(headers).toEqual(cookies)
          })
        })
      }
    )
  }
)
