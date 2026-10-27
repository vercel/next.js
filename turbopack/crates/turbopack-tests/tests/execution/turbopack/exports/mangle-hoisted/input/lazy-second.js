// Keep both members in the shared group while reading and updating the noncanonical member.
import { someLongExportName } from './shared'
import { liveValue, increment } from './second'

export function readAndIncrement() {
  const before = liveValue
  increment()
  return [someLongExportName, before, liveValue]
}
