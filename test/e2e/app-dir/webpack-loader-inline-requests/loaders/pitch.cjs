module.exports = function () {
  throw new Error('The forwarding loader must only run its pitch')
}

module.exports.pitch = function (remainingRequest) {
  return `module.exports = require(${JSON.stringify(`!!${remainingRequest}`)})`
}
