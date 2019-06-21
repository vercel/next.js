class UrlNode {
  placeholder: boolean = true
  children: Map<string, UrlNode> = new Map()
  slugName: string | null = null

  get hasSlug() {
    return this.slugName != null
  }

  insert(urlPath: string): void {
    this._insert(urlPath.split('/').filter(Boolean))
  }

  smoosh(): string[] {
    return this._smoosh()
  }

  private _smoosh(prefix: string = '/'): string[] {
    const childrenPaths = [...this.children.keys()].sort()
    if (this.hasSlug) {
      childrenPaths.splice(childrenPaths.indexOf('[]'), 1)
    }

    const routes = childrenPaths
      .map(c => this.children.get(c)!._smoosh(`${prefix}${c}/`))
      .reduce((prev, curr) => [...prev, ...curr], [])

    if (this.hasSlug) {
      routes.push(
        ...this.children.get('[]')!._smoosh(`${prefix}[${this.slugName}]/`)
      )
    }

    if (!this.placeholder) {
      routes.unshift(prefix === '/' ? '/' : prefix.slice(0, -1))
    }

    return routes
  }

  private _insert(urlPaths: string[]): void {
    if (urlPaths.length === 0) {
      this.placeholder = false
      return
    }

    let [nextSegment] = urlPaths
    if (nextSegment.startsWith('[') && nextSegment.endsWith(']')) {
      const slugName = nextSegment.slice(1, -1)
      if (this.hasSlug && slugName !== this.slugName) {
        throw new Error(
          'You cannot use different slug names for the same dynamic path.'
        )
      }

      this.slugName = slugName
      nextSegment = '[]'
    }

    if (!this.children.has(nextSegment)) {
      this.children.set(nextSegment, new UrlNode())
    }

    this.children.get(nextSegment)!._insert(urlPaths.slice(1))
  }
}

export function getSortedRoutes(normalizedPages: string[]): string[] {
  const root = new UrlNode()
  normalizedPages.forEach(page => root.insert(page))
  return root.smoosh()
}
