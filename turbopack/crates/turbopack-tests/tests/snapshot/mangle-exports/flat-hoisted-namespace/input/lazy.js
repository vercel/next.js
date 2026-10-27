import { sameLongExportName as first, a as firstShort } from './first'
import { sameLongExportName as second, a as secondShort } from './second'
import { sameLongExportName as third, a as thirdShort } from './third'

export const read = () => [
  first,
  second,
  third,
  firstShort,
  secondShort,
  thirdShort,
]
