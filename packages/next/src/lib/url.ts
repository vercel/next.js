function getUrlWithoutHost(url: string) {
  return new URL(url, 'http://n')
}

export function getPathname(url: string) {
  return getUrlWithoutHost(url).pathname
}
