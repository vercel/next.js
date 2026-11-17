// A build that turns the route collapse off emits separate suffixed and plain
// entries for each dynamic route. The `.rsc` routing rules must still resolve
// to the function without the plain entry capturing the suffix.
process.env.TEST_COLLAPSE_ADAPTER_ROUTES = 'false'

describe('adapter-config without collapseAdapterRoutes', () => {
  require('./adapter-config.test')
})
