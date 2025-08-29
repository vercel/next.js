module.exports = function (content, _map, _meta) {
  const options = this.getOptions()
  if (!content.includes('untransformed')) {
    throw new Error('loader matched multiple times')
  }
  const returnValue = options?.returnValue ?? 'default return value'
  return `export default ${JSON.stringify(returnValue)}`
}
