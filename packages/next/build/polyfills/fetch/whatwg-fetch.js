/* globals self */
const fetch = {
  Headers: self.Headers.bind(self),
  Request: self.Request.bind(self),
  Response: self.Response.bind(self),
  fetch: self.fetch.bind(self),
}

module.exports = fetch
module.exports.default = fetch
