/* globals self */
const stub = {
  Headers: self.Headers,
  Request: self.Request,
  Response: self.Response,
  fetch: self.fetch.bind(self),
}

module.exports = stub
module.exports.default = stub
