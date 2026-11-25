// Loaders are loaded with `require`, which doesn't support ES modules in every supported Node.js
// version, so load the ES module entry with `import()`.
module.exports = async function () {
  const { value } = await import('./c05-entry.mjs')
  return `export default ${JSON.stringify(value)}`
}
