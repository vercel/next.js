import type { AppRouteModule } from '../module.compiled'

// route handlers are only statically optimized if they define
// one of these top-level configs manually
//   - dynamic = 'force-static'
//   - dynamic = 'error'
//   - revalidate > 0
//   - revalidate = false
//   - generateStaticParams
export function isStaticGenEnabled(
  mod: AppRouteModule['routeModule']['userland']
) {
  return (
    mod.dynamic === 'force-static' ||
    mod.dynamic === 'error' ||
    mod.revalidate === false ||
    (mod.revalidate !== undefined && mod.revalidate > 0) ||
    typeof mod.generateStaticParams == 'function'
  )
}
