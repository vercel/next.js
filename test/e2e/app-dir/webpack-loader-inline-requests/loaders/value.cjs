module.exports = function (content) {
  const current = this.loaders[this.loaderIndex]
  return `module.exports = ${JSON.stringify({
    value: content.trim(),
    options: this.getOptions(),
    query: this.query,
    loaderFragment: current.fragment,
    resourceQuery: this.resourceQuery,
    resourceFragment: this.resourceFragment,
  })}`
}
