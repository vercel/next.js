import * as preserved from './mixed-preserved'
import {
  someLongExportName as first,
  a as firstShort,
  liveValue,
  increment,
} from './mixed-first'
import { someLongExportName as second, a as secondShort } from './mixed-second'

export const namespace = () => preserved
export const read = () => [
  preserved.someLongExportName,
  first,
  second,
  firstShort,
  secondShort,
  preserved.liveValue,
  liveValue,
]
export const update = () => {
  preserved.increment()
  increment()
}
