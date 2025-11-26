function getChunk(chunkId) {
  var chunk = require(
    '../../' +
      ({}[chunkId] || chunkId) +
      '.' +
      {
        a: 'b',
        c: 'd',
      }[chunkId] +
      '.js'
  )
  return chunk
}

module.exports = { getChunk }
