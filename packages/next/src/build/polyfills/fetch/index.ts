/* globals self */
// @ts-expect-error fetch is expected to be overwritten.
var fetch = self.fetch.bind(self)
module.exports = fetch
module.exports.default = module.exports
