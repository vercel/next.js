import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

export const proxy = wrapProxy({ '/[lang]/[slug]': [theme] })

export const config = {
  matcher: ['/((?!_next/|favicon\\.ico$).*)'],
}
