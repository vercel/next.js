const kCustomPromisifyArgsSymbol = Symbol('customPromisifyArgs')
module.exports = function promisify (original) {
  // Names to create an object from in case the callback receives multiple
  // arguments, e.g. ['stdout', 'stderr'] for child_process.exec.
  const argumentNames = original[kCustomPromisifyArgsSymbol]

  return function fn (...args) {
    return new Promise((resolve, reject) => {
      try {
        original.call(this, ...args, (err, ...values) => {
          if (err) {
            reject(err)
          } else if (argumentNames !== undefined && values.length > 1) {
            const obj = {}
            for (var i = 0; i < argumentNames.length; i++) { obj[argumentNames[i]] = values[i] }
            resolve(obj)
          } else {
            resolve(values[0])
          }
        })
      } catch (err) {
        reject(err)
      }
    })
  }
}
