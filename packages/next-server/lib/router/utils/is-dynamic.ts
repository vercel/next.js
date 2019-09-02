// Identify /[param]/ or /`some prefix`[param]/in route string
const TEST_ROUTE = /\/[^\/]*?\[[^\/]+?\](?=\/|$)/

export function isDynamicRoute(route: string): boolean {
  return TEST_ROUTE.test(route)
}
