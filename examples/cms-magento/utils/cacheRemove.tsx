const regexCacheRemove = /\/cache\/[a-z0-9]*\//g

export const cacheRemove = (url: string) => {
  return url.replace('http:', 'https:').replace(regexCacheRemove, '/')
}
