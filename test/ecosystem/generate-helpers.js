function divideArrayInChunks(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

function normalizePackageName(packageName) {
  const normalized = packageName
    .replaceAll('/', '_')
    .replaceAll('@', '_')
    .replaceAll('-', '_')
    .replaceAll('.', '_')

  // Routes can't start with `_` as that gets ignored
  if (normalized.startsWith('_')) {
    return normalized.slice(1)
  }
  return normalized
}

module.exports = {
  divideArrayInChunks,
  normalizePackageName,
}
