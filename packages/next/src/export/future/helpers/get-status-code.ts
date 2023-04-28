const FILE_BASED_STATUS_CODES = [404, 500].reduce<
  Array<{ statusCode: number; pathname: string }>
>((acc, statusCode) => {
  acc.push({ statusCode, pathname: `/${statusCode}` })
  acc.push({ statusCode, pathname: `/${statusCode}.html` })
  acc.push({ statusCode, pathname: `/${statusCode}/index.html` })
  return acc
}, [])

/**
 * Get the status code based on the filename. Some routes are special where they
 * include the status code in the filename, such as 404.html or 500.html. This
 * parses out those codes.
 *
 * @param pathname the pathname to parse
 * @returns the status code if found, otherwise null
 */
export function getStatusCode(pathname: string): number | null {
  for (const match of FILE_BASED_STATUS_CODES) {
    if (pathname === match.pathname) {
      return match.statusCode
    }
  }

  return null
}
