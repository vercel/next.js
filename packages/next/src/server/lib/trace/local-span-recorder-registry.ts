import type { LocalSpanRecorder } from './local-span-recorder'

// Some development entrypoints, including the proxy adapter, bundle their own
// tracer copy. This versioned function-only registry lets those copies reach
// the externalized recorder without sharing any per-request state globally.
const LOCAL_SPAN_RECORDER_KEY = Symbol.for(
  `@next/local-span-recorder@${process.env.__NEXT_VERSION}`
)

type GlobalWithLocalSpanRecorder = typeof globalThis & {
  [LOCAL_SPAN_RECORDER_KEY]?: LocalSpanRecorder
}

export function getRegisteredLocalSpanRecorder():
  | LocalSpanRecorder
  | undefined {
  return (globalThis as GlobalWithLocalSpanRecorder)[LOCAL_SPAN_RECORDER_KEY]
}

export function setRegisteredLocalSpanRecorder(
  recorder: LocalSpanRecorder
): void {
  ;(globalThis as GlobalWithLocalSpanRecorder)[LOCAL_SPAN_RECORDER_KEY] =
    recorder
}
