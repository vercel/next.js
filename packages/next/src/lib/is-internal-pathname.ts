export function isInternalPathname(pathname: string): boolean {
  return pathname.startsWith('next/dist/pages/')
}
