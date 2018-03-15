// Transform a callback into a Promise, this avoids the use of util.promisify
// That's only available since Node 8.0.0
module.exports = function promisify (fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) return reject(err)
      return resolve(result)
    })
  })
}
