export function isAPIRoute(value?: string) {
  return value === '/api' || Boolean(value?.startsWith('/api/'))
}
