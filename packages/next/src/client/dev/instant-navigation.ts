import { NEXT_INSTANT_TEST_COOKIE } from '../components/app-router-headers'
import type { InstantCookie } from '../../shared/lib/app-router-types'
import { parseInstantNavCookieValue } from '../../shared/lib/instant-nav-cookie'

export function readInstantNavigationCookie(): string {
  if (typeof document === 'undefined') return ''
  const prefix = NEXT_INSTANT_TEST_COOKIE + '='
  return (
    document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(prefix))
      ?.slice(prefix.length) ?? ''
  )
}

export function armInstantNavigation(): void {
  const pending: InstantCookie = [0, `p${Math.random()}`]
  document.cookie = `${NEXT_INSTANT_TEST_COOKIE}=${JSON.stringify(pending)}; Path=/`
}

export function releaseInstantNavigation(): void {
  document.cookie = `${NEXT_INSTANT_TEST_COOKIE}=; Path=/; Max-Age=0`
}

export function getInstantNavigationStatus() {
  if (typeof cookieStore === 'undefined') return 'unsupported'
  const raw = readInstantNavigationCookie()
  if (!raw) return 'idle'
  switch (parseInstantNavCookieValue(raw).state) {
    case 'pending':
      return 'armed'
    case 'mpa':
      return 'page-load'
    case 'spa':
      return 'client-navigation'
  }
}
