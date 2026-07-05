import * as Log from './output/log'

export function warnAboutEdgeRuntime() {
  // Webpack build workers each run in a separate process with their own
  // warnOnce cache, so the same warning would be emitted once per worker.
  // Suppress in workers; the main build process emits the warning once during
  // the "Collecting page data" phase.
  if (process.env.NEXT_PRIVATE_BUILD_WORKER) return
  Log.warnOnce(
    `The Edge Runtime is deprecated. You can use the "nodejs" runtime instead. Learn more: https://nextjs.org/docs/messages/edge-runtime-deprecated`
  )
}

export function warnAboutPreferredRegion() {
  if (process.env.NEXT_PRIVATE_BUILD_WORKER) return
  Log.warnOnce(
    `The "preferredRegion" route segment config is deprecated. Learn more: https://nextjs.org/docs/messages/preferred-region-deprecated`
  )
}
