module.exports = async function () {
  const imported = await this.importModule(
    this.resourcePath.replace(/\.importer$/, '.emit-imported')
  )
  return `export default ${JSON.stringify(imported.default)}`
}
