'use strict';

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./cjs/scheduler-unstable_mock.production.js');
} else {
  module.exports = require('./cjs/scheduler-unstable_mock.development.js');
}
