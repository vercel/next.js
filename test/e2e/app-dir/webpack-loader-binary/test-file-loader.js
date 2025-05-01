module.exports = function (content) {
  let result
  if (content instanceof Buffer) {
    result = `Got a buffer of ${content.length} bytes`
  } else {
    result = `Didn't receive a buffer`
  }
  return Buffer.from(`module.exports = ${JSON.stringify(result)}`)
}
module.exports.raw = true
