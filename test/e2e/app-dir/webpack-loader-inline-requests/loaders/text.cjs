module.exports = function (content) {
  return `module.exports = ${JSON.stringify(content.trim())}`
}
