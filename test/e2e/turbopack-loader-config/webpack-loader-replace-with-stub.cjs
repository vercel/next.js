module.exports = async function (content, _map, _meta) {
  const { getOptions } = this
  const options = getOptions()
  if (options !== this.getOptions()) {
    throw new Error('detached getOptions returned different options')
  }
  await Promise.resolve()
  if (getOptions() !== options) {
    throw new Error('getOptions changed during async loader execution')
  }
  if (!content.includes('untransformed')) {
    throw new Error('loader matched multiple times')
  }
  const returnValue = options?.returnValue ?? 'default return value'
  return `export default ${JSON.stringify(returnValue)}`
}
