import { PathnameMatchResult, PathnameMatcher } from './pathname-matcher'

/**
 * StaticPathnameMatcher is a matcher that matches a static pathname by direct
 * comparison.
 */
export class StaticPathnameMatcher extends PathnameMatcher {
  public match(pathname: string): PathnameMatchResult | null {
    if (pathname !== this.pathname) return null

    return {}
  }
}
