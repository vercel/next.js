process.env.CUSTOM_CACHE_HANDLER = require.resolve(
  './cache-handler-default-export.js'
)
require('./app-static.test')
