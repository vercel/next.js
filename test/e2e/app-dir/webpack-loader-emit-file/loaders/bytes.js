module.exports = function (content) {
  return `export default new Uint8Array(${JSON.stringify(Array.from(Buffer.from(content)))})`
}
