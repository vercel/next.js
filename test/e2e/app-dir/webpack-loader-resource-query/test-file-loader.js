module.exports = function loader(code) {
  console.log('resource query: ', this.resourceQuery)
  return 'export const v = "anything"'
}
