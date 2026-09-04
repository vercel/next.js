// Runs the whole variants suite again under a base path.
//
// A base path prefixes every path a client asks for, and variants are almost
// entirely path work: the proxy matches a route, the adapter writes a prefix,
// routing strips it again, and the build writes artifacts under it. Each of
// those is a place the prefix and the base path can disagree, so the suite is
// run again rather than a few cases being picked out of it.
//
// The variable is read by `variants.test.ts`, which hands it to the build and
// prefixes the paths it requests, and by the fixture's `next.config.js`.
process.env.BASE_PATH = '/base'

require('./variants.test')
