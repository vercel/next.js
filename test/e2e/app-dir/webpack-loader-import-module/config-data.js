const cjsDep = require('./cjs-dep')

module.exports = {
  title: 'Import Module Works',
  items: ['apple', 'banana', 'cherry'],
  cjsGreeting: cjsDep.greeting,
  version: cjsDep.version,
}
