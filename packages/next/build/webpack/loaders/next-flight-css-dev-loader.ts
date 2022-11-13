/**
 * For server-side CSS imports, we need to ignore the actual module content but
 * still trigger the hot-reloading diff mechanism. So here we put the content
 * inside a comment.
 */

export function pitch(this: any) {
  const content = this.fs.readFileSync(this.resourcePath)
  this.data.__checksum = (
    typeof content === 'string' ? Buffer.from(content) : content
  ).toString('hex')
}

const NextServerCSSLoader = function (this: any, content: string) {
  this.cacheable && this.cacheable()

  const isCSSModule = this.resourcePath.match(/\.module\.(css|sass|scss)$/)
  if (isCSSModule) {
    return (
      content +
      '\nmodule.exports.__checksum = ' +
      JSON.stringify(this.data.__checksum)
    )
  }

  return `export default ${JSON.stringify(this.data.__checksum)}`
}

export default NextServerCSSLoader
