import { addBasePath } from './add-base-path'

/**
 * Function to correctly assign location to URL
 *
 * The method will add basePath, and will also correctly add location (including if it is a relative path)
 * @param location Location that should be added to the url
 * @param url Base URL to which the location should be assigned
 */
export function assignLocation(location: string, url: URL): URL {
  if (location.startsWith('.')) {
    const urlBase = url.origin + url.pathname
    return new URL(
      // In order for a relative path to be added to the current url correctly, the current url must end with a slash
      // new URL('./relative', 'https://example.com/subdir').href -> 'https://example.com/relative'
      // new URL('./relative', 'https://example.com/subdir/').href -> 'https://example.com/subdir/relative'
      (urlBase.endsWith('/') ? urlBase : urlBase + '/') + location
    )
  }

  return new URL(addBasePath(location), url.href)
}
