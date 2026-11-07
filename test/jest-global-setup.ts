export default function globalSetup() {
  // `__NEXT_TEST_AXIS` names an alternate flag configuration of the test
  // matrix. Axes are letters (`A`, `B`, …). A fixture can key an experimental
  // flag on an axis to cover both states of the flag:
  //
  // ```js
  // experimental: {
  //   concurrentRouterQueue: process.env.__NEXT_TEST_AXIS !== 'A',
  // }
  // ```
  //
  // A plain run enables the flag, and the axis run disables it. See
  // `test/lib/gate/README.md`.
  //
  // The only axis today is `A`. It is an alias for the Cache Components run
  // (`__NEXT_CACHE_COMPONENTS=true`), so CI has no separate job for it. Most
  // fixtures that use the axis set `cacheComponents: true` themselves, so the
  // env default of that run does not change them. Setting either variable sets
  // the other.
  if (process.env.__NEXT_TEST_AXIS) {
    process.env.__NEXT_CACHE_COMPONENTS = 'true'
  } else if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    process.env.__NEXT_TEST_AXIS = 'A'
  }
}
