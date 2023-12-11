export const DEFAULT_SEGMENT = 'default'

export function isDefaultRoute(value?: string) {
  return value?.endsWith(`/${DEFAULT_SEGMENT}`)
}
