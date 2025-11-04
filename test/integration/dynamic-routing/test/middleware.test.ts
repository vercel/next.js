/* eslint-env jest */

process.env.__MIDDLEWARE_TEST = '1'

// run all existing tests from ./index.test.js with middleware
// setup enabled via the above env variable
require('./index.test')
