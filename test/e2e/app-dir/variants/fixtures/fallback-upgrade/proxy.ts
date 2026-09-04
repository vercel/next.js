import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

export const proxy = wrapProxy({
  '/prefix/[one]': [theme],
})

export const config = {
  matcher: ['/prefix/:one'],
}
