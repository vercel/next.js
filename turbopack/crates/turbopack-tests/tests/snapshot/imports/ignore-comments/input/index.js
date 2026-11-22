// Ignore comments on imports and requires are covered by the
// `imports/ignore-comments` execution test. Web workers are only created for
// browser targets, so this case is covered by a snapshot test.
new Worker(
  /* turbopackIgnore: false */ new URL('./vercel.cjs', import.meta.url)
)

// Shouldn't cause a worker to be created, but `ignore-worker.cjs` is still
// pulled in by `new URL()`
new Worker(
  /* turbopackIgnore: true */ new URL('./ignore-worker.cjs', import.meta.url)
)
new Worker(
  /* webpackIgnore: true */ new URL('./ignore-worker.cjs', import.meta.url)
)
