// This suffix detector also classifies webpack bundle names (e.g. app/x/route),
// not just complete raw Page identifiers. It does not normalize or return an
// identity, so bundle paths remain strings rather than being asserted as Pages.
export function isAppRouteRoute(route: string): boolean {
  return route.endsWith('/route')
}
