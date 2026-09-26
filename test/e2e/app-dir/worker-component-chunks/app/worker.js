import {
  marker as bothPagesMarker,
  payload as bothPagesPayload,
} from '../lib/shared-with-both-pages'
import {
  marker as onePageMarker,
  payload as onePagePayload,
} from '../lib/shared-with-one-page'

// Reading the payloads keeps the filler in both modules alive.
self.postMessage(
  `${bothPagesMarker}:${bothPagesPayload.length}|${onePageMarker}:${onePagePayload.length}`
)
