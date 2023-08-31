import type { Normalizer } from './normalizer'

export type BasePathInfo = {
  /**
   * The pathname without the prefix.
   */
  pathname: string

  /**
   * True if the pathname had the prefix.
   */
  hadBasePath: boolean
}

export class BasePathNormalizer implements Normalizer {
  public readonly basePath: string

  constructor(basePath: string) {
    if (!basePath || !basePath.startsWith('/')) {
      throw new Error(
        `Invariant: basePath must start with a /, got ${basePath}`
      )
    }

    this.basePath = basePath
  }

  /**
   * Analyzes the pathname to see if it has the basePath prefix.
   *
   * @param pathname the pathname to analyze
   */
  public analyze(pathname: string): BasePathInfo {
    let hadBasePath: boolean = false
    if (pathname === this.basePath) {
      hadBasePath = true
      pathname = '/'
    } else if (pathname.startsWith(this.basePath + '/')) {
      hadBasePath = true
      pathname = pathname.slice(this.basePath.length)
    }
    return { pathname, hadBasePath }
  }

  /**
   * Removes the basePath from the pathname if it exists.
   *
   * @param pathname the pathname that may have the basePath prefix
   * @returns the pathname without the basePath prefix
   */
  public normalize(pathname: string): string {
    const { pathname: normalized } = this.analyze(pathname)
    return normalized
  }

  /**
   * Adds the basePath to the pathname.
   *
   * @param pathname the pathname to add the basePath to
   * @returns the pathname with the basePath added
   */
  public denormalize(pathname: string): string {
    if (pathname === '/') {
      return this.basePath
    }

    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname
    }

    return this.basePath + pathname
  }
}
