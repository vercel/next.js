export type PathnameMatchResult = {
  /**
   * The params for the route if the route is dynamic.
   */
  params?: Record<string, string | string[]>
}

export abstract class PathnameMatcher {
  constructor(public readonly pathname: string) {}

  /**
   * Matches the given pathname against the route and returns any params if the
   * route was dynamic.
   *
   * @param pathname the pathname to match against
   * @returns the match result or null if the route did not match
   */
  public abstract match(pathname: string): PathnameMatchResult | null
}
