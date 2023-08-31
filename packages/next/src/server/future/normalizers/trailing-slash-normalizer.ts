export class TrailingSlashNormalizer {
  constructor(public readonly shouldAddTrailingSlash: boolean) {}

  /**
   * Removes the trailing slash from a pathname.
   *
   * @param pathname the pathname to remove the trailing slash from
   * @returns the pathname without the trailing slash
   */
  public remove(pathname: string): string {
    if (pathname === '/' || !pathname.endsWith('/')) {
      return pathname
    }

    return pathname.slice(0, -1)
  }

  /**
   * Adds a trailing slash to a pathname.
   *
   * @param pathname the pathname to add the trailing slash to
   * @returns the pathname with the trailing slash added
   */
  public add(pathname: string): string {
    if (pathname === '/' || pathname.endsWith('/')) {
      return pathname
    }

    return pathname + '/'
  }

  /**
   * Normalize a pathname by adding a trailing slash if it's enabled and
   * removing a trailing slash if it's disabled.
   *
   * @param pathname The pathname to normalize
   * @returns The normalized pathname
   */
  public normalize(pathname: string): string {
    if (this.shouldAddTrailingSlash) {
      return this.add(pathname)
    }

    return this.remove(pathname)
  }
}
