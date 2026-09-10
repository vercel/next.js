import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

export const proxy = wrapProxy({ '/hub': [], '/[[...slug]]': [theme] })

export const config = {
  matcher: ['/', '/((?!_next/|favicon\\.ico$).*)'],
}
