import { createNextDescribe } from 'e2e-utils'

import { basePath } from './next.config'

createNextDescribe(
  'base path support for usePathname',
  {
    files: __dirname,
  },
  ({ next }) => {
    it.each(['/', '/dashboard'])(
      'should render %s without the basePath',
      async (pathname) => {
        const $ = await next.render$(basePath + pathname)
        expect($('#pathname').data('pathname')).toBe(pathname)
      }
    )
  }
)
