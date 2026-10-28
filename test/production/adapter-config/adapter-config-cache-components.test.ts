process.env.TEST_CACHE_COMPONENTS = '1'

// TODO(NAR-423): Migrate to Cache Components.
// @gate FIXME
describe('adapter-config-cache-components', () => {
  require('./adapter-config.test')
})
