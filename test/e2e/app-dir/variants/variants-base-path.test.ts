// Runs the whole variants suite again under a base path.
//
// A base path prefixes every path a client asks for, while a route carries
// none, so every site that matches a request against a route has to remove it
// first.
//
// The variable is read by `variants.test.ts`, which hands it to the build and
// prefixes the paths it requests, and by the fixture's `next.config.js`.
process.env.BASE_PATH = '/base'

require('./variants.test')
