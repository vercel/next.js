// Identify /[[param]]/ in route string
const TEST_OPTIONAL_CATCH_ALL_ROUTE = /\/(\[\[[^/]+?\]\])(?=\/|$)/

export function isOptionalCatchAllRoute(route: string): boolean {
  return TEST_OPTIONAL_CATCH_ALL_ROUTE.test(route)
}
