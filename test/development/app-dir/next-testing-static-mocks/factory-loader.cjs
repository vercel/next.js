module.exports = function (source, inputMap) {
  this.callback(
    null,
    source.replaceAll('factory-before', 'factory-after!'),
    inputMap
  )
}
