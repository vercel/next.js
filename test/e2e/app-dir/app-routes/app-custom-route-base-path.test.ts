// TODO(deploy-test-completion): Remove this suite from the deploy manifest.
// It was excluded as a known deploy failure without a documented root cause.
process.env.BASE_PATH = '/docs'
require('./app-custom-routes.test')
