/**
 * Polyfills the `Headers.getAll(name)` method so it'll work in the edge
 * runtime.
 */

if (!('getAll' in Headers.prototype)) {
  // @ts-expect-error - this is polyfilling this method so it doesn't exist yet
  Headers.prototype.getAll = function (name: string) {
    name = name.toLowerCase()
    if (name !== 'set-cookie')
      throw new Error('Headers.getAll is only supported for Set-Cookie header')

    const headers = [...this.entries()].filter(([key]) => key === name)
    return headers.map(([, value]) => value)
  }
}
