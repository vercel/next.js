module.exports = function (content) {
  const { label } = this.getOptions()
  return content + `;module.exports += ${JSON.stringify(`:${label}`)}`
}
