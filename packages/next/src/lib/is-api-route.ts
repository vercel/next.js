export function isAPIRoute(value?: string) {
  if (typeof value !== 'string') return false
  return value.startsWith('/api/') || value === '/api'
}
