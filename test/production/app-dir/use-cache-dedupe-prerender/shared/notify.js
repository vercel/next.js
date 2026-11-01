const { get } = require('node:http')

// Handler barriers and after() notifications bypass Next's patched fetch.
// Patched fetch can suspend during prerendering instead of sending the request.
function notify(key) {
  return new Promise((resolve, reject) => {
    get(`${process.env.TEST_DATA_SERVICE_URL}?key=${key}`, (response) => {
      response.resume()
      response.on('end', resolve)
      response.on('error', reject)
    }).on('error', reject)
  })
}

module.exports = { notify }
