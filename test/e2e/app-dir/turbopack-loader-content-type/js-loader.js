module.exports = function jsLoader(source) {
  return source.replace('Hello JS', 'Hello from loader')
}
