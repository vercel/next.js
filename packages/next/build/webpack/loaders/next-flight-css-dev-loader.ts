/**
 * For server-side CSS imports, we need to ignore the actual module content but
 * still trigger the hot-reloading diff mechanism. So here we put the content
 * inside a comment.
 */

const NextServerCSSLoader = function (this: any, source: string | Buffer) {
  this.cacheable && this.cacheable()

  return `export default "${(typeof source === 'string'
    ? Buffer.from(source)
    : source
  ).toString('hex')}"`
}

export default NextServerCSSLoader
