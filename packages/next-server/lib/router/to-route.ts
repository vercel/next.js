export function toRoute(path: string): string {
  return path.replace(/\/$/, '') || '/'
}
