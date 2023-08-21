export function isInternalComponent(pathname: string): boolean {
  switch (pathname) {
    case 'next/dist/pages/_app':
    case 'next/dist/pages/_document':
      return true
    default:
      return false
  }
}
