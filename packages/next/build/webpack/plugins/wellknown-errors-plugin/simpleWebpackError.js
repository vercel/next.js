'use strict'

exports.__esModule = true
exports.SimpleWebpackError = void 0

// This class creates a simplified webpack error that formats nicely based on
// webpack's build in serializer.
// https://github.com/webpack/webpack/blob/c9d4ff7b054fc581c96ce0e53432d44f9dd8ca72/lib/Stats.js#L294-L356
class SimpleWebpackError extends Error {
  constructor(file, message) {
    super(message)
    this.file = void 0
    this.file = file
  }
}

exports.SimpleWebpackError = SimpleWebpackError
//# sourceMappingURL=simpleWebpackError.js.map
