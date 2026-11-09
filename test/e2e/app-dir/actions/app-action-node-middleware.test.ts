// increment to trigger deploy tests: v1
process.env.TEST_NODE_MIDDLEWARE = 'true'

require('./app-action.test')
