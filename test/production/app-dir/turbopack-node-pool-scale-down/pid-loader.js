// Exports the id of the Node.js process that runs this loader.
module.exports = function pidLoader() {
  return `export default ${process.pid}`
}
