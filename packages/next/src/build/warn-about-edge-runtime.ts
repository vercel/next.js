import * as Log from './output/log'

export function warnAboutEdgeRuntime() {
  Log.warnOnce(
    `The Edge Runtime is deprecated. You can use the "nodejs" runtime instead. Learn more: https://nextjs.org/docs/messages/edge-runtime-deprecated`
  )
}

export function warnAboutPreferredRegion() {
  Log.warnOnce(
    `The "preferredRegion" route segment config is deprecated. Learn more: https://nextjs.org/docs/messages/preferred-region-deprecated`
  )
}
