module.exports = function loader(source) {
  require.resolve('./dependency')
  return source
}
