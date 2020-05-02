const withTM = require('next-transpile-modules')([
  '@formatjs/intl-relativetimeformat',
  '@formatjs/intl-utils',
  'react-intl',
  'intl-format-cache',
  'intl-messageformat-parser',
  'intl-messageformat',
])

module.exports = withTM()
