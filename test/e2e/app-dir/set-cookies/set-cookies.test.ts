import { createNextDescribe } from 'e2e-utils'
import type { Response } from 'node-fetch'

import cookies, { nextConfigHeaders } from './cookies.mjs'

function getSetCookieHeaders(res: Response): ReadonlyArray<string> {
  return (
    (res.headers as any).getSetCookie?.() ??
    (res.headers as any).raw()['set-cookie']
  )
}

createNextDescribe(
  'set-cookies',
  {
    files: __dirname,
    // TODO: re-enable once this behavior is corrected on deploy
    skipDeployment: true,
  },
  ({ next }) => {
    describe.each(['edge', 'experimental-edge', 'node'])(
      'for %s runtime',
      (runtime) => {
        describe.each(['pages', 'app'])('for /%s', (dir) => {
          it('should set two set-cookie headers', async () => {
            let res = await next.fetch(`/api/${dir}/${runtime}`)

            let headers = getSetCookieHeaders(res)

            expect(headers).toHaveLength(2)
            expect(headers).toEqual(cookies)

            res = await next.fetch(
              `/api/${dir}/${runtime}?next-config-headers=true`
            )

            headers = getSetCookieHeaders(res)

            expect(headers).toHaveLength(4)
            expect(headers).toEqual([...nextConfigHeaders, ...cookies])
          })
        })
      }
    )
  }
)
