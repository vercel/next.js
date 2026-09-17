const http = require('node:http')

module.exports = function (source) {
  const gate = source.match(/compile-gate: (http:\/\/[^\s]+)/)
  if (!gate) return source

  // Let the test hold a real compilation open until it releases the response.
  const callback = this.async()
  http
    .get(gate[1], (response) => {
      response.resume()
      response.on('end', () => callback(null, source))
    })
    .on('error', callback)
}
