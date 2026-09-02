// Deploy mode exclusion: This suite installs a process-local custom cache
// handler, while a hosting platform supplies its own cache infrastructure.
process.env.CUSTOM_CACHE_HANDLER = '1'
require('./app-static.test')
