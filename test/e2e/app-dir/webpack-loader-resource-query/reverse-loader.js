module.exports = function reverseLoader(source) {
  const reversed = source.split('').reverse().join('')
  return `export default ${JSON.stringify(reversed)}`
}
