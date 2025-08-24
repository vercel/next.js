'use client'
import { usePathname } from 'next/navigation'
import { NavigateAndTrackRouterIdentity } from '../navigate'

export function NavigateToOther() {
  const pathname = usePathname()
  const otherPage = pathname.endsWith('/one')
    ? pathname.replace('/one', '/two')
    : pathname.endsWith('/two')
      ? pathname.replace('/two', '/one')
      : (() => {
          throw new Error('Unrecognized pathname: ' + pathname)
        })()

  return <NavigateAndTrackRouterIdentity href={otherPage} />
}
