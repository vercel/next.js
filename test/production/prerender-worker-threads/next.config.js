const { isMainThread } = require('node:worker_threads')

// Loading the addon here puts it in the main build process, so the load the page
// performs inside the static generation worker is the *second* one. Both matter:
// "Module did not self-register" only happens on a second `dlopen` of the same
// file in one process, so an addon only ever loaded inside the worker would
// register there and the build would succeed.
//
// The `isMainThread` guard keeps the first two cases pointed at the static
// generation worker. `next build` also runs Turbopack in a worker thread that
// re-evaluates this file, and loading the addon there too fails the build before
// static generation is reached. The last case in the suite covers that separately.
if (isMainThread) {
  require('single-context-addon')
}

module.exports = {}
