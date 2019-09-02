class UrlNode {
  placeholder: boolean = true
  children: Map<string, UrlNode> = new Map()
  slugName: string | null = null
  slugPrefix: string = ''

  hasSlug() {
    return this.slugName != null
  }

  hasSlugPrefix() {
    return this.slugPrefix != ''
  }

  insert(urlPath: string): void {
    this._insert(urlPath.split('/').filter(Boolean))
  }

  smoosh(): string[] {
    return this._smoosh()
  }

  private _smoosh(prefix: string = '/'): string[] {
    // When sorting paths, dynamic paths must be behind others.
    // In addition, z[foo] must be behind a[foo], b[foo], and zz[foo].
    // Hence, should sort paths with the lowest priority of `[`
    const keys = this.children.keys()
    let childrenPaths: string[] = []
    for (let key of keys) {
      childrenPaths.push(key.replace('[', String.fromCharCode(127)))
    }
    childrenPaths = childrenPaths.sort()
    childrenPaths = childrenPaths.map(path =>
      path.replace(String.fromCharCode(127), '[')
    )

    const routes = childrenPaths
      .map(c => this.children.get(c)!._smoosh(`${prefix}${c}/`))
      .reduce((prev, curr) => [...prev, ...curr], [])

    if (!this.placeholder) {
      routes.unshift(prefix === '/' ? '/' : prefix.slice(0, -1))
    }

    return routes
  }

  private _insert(urlPaths: string[], slugNames: string[] = []): void {
    if (urlPaths.length === 0) {
      this.placeholder = false
      return
    }

    // The next segment in the urlPaths list
    let nextSegment = urlPaths[0]

    // Check if the segment matches `[something]` or `prefix[something]`
    if (/[^\/]*?\[[^\/]+?\]/g.test(nextSegment)) {
      // Strip `[` and `]`, leaving only `something` and `prefix`
      const slugName = nextSegment.replace(/([^\/]*?)\[([^\/]+?)\]/g, '$2')
      const slugPrefix = nextSegment.replace(/([^\/]*?)\[([^\/]+?)\]/g, '$1')
      // If the specific segment already has a slug but the slug is not `something`
      // This prevents collisions like:
      // pages/[post]/index.js
      // pages/[id]/index.js
      // Because currently multiple dynamic params on the same segment level are not supported
      if (
        this.hasSlug() &&
        slugName !== this.slugName &&
        ((slugPrefix == '' && !this.hasSlugPrefix()) ||
          slugPrefix == this.slugPrefix)
      ) {
        // TODO: This error seems to be confusing for users, needs an err.sh link, the description can be based on above comment.
        throw new Error(
          'You cannot use different slug names for the same dynamic path.'
        )
      }

      if (slugNames.indexOf(slugName) !== -1) {
        throw new Error(
          `You cannot have the same slug name "${slugName}" repeat within a single dynamic path`
        )
      }

      slugNames.push(slugName)
      // slugName is kept as it can only be one particular slugName
      this.slugName = slugName
      this.slugPrefix = slugPrefix
    }

    // If this UrlNode doesn't have the nextSegment yet we create a new child UrlNode
    if (!this.children.has(nextSegment)) {
      this.children.set(nextSegment, new UrlNode())
    }

    this.children.get(nextSegment)!._insert(urlPaths.slice(1), slugNames)
  }
}

export function getSortedRoutes(normalizedPages: string[]): string[] {
  // First the UrlNode is created, and every UrlNode can have only 1 dynamic segment
  // Eg you can't have pages/[post]/abc.js and pages/[hello]/something-else.js
  // Only 1 dynamic segment per nesting level

  // So in the case that is test/integration/dynamic-routing it'll be this:
  // pages/[post]/comments.js
  // pages/blog/[post]/comment/[id].js
  // Both are fine because `pages/[post]` and `pages/blog` are on the same level
  // So in this case `UrlNode` created here has `this.slugName === 'post'`
  // And since your PR passed through `slugName` as an array basically it'd including it in too many possibilities
  // Instead what has to be passed through is the upwards path's dynamic names
  const root = new UrlNode()
  // Here the `root` gets injected multiple paths, and insert will break them up into sublevels
  normalizedPages.forEach(pagePath => root.insert(pagePath))
  // Smoosh will then sort those sublevels up to the point where you get the correct route definition priority
  return root.smoosh()
}
