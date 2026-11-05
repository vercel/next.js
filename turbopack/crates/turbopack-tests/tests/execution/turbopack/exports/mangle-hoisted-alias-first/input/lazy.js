import { someLongExportName, a, liveValue, increment } from './flat'
import * as preserved from './preserved'

export const read = () => [someLongExportName, a, liveValue, preserved]
export function update() {
  increment()
  preserved.increment()
}
