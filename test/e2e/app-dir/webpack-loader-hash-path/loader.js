module.exports = function (source) {
  return `export const resourcePath = ${JSON.stringify(this.resourcePath)};
export const resourceFragment = ${JSON.stringify(this.resourceFragment || '')};
${source}`
}
