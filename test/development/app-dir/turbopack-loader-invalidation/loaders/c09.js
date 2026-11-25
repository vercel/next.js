module.exports = async function () {
  const { value } = await import('./c09-dep.mjs')
  return `export default ${JSON.stringify(value)}`
}
