function x(module) {}

exports.asdf = 'asdf'
console.log(module.require('./dep.js'))

if (module.require) console.log('yes')
