// Runs the cache lifetime suite again under a base path.
//
// This suite is the only one that revalidates a stale prerender, and a
// revalidation takes a path no other test does: the request the origin sees is
// rebuilt from the artifact rather than routed from a client. That rebuild
// starts from the path the artifact was written under, which is where a base
// path and the variants prefix can disagree.
//
// The variable is read by `variants-cache-lifetime.test.ts`, which hands it to
// the build and prefixes the paths it requests, and by the fixture's
// `next.config.js`.
process.env.BASE_PATH = '/base'

require('./variants-cache-lifetime.test')
