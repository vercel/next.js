import { sameLongExportName as first, a as firstShort } from './first'
import { sameLongExportName as second, a as secondShort } from './second'

export const read = () => [first, second, firstShort, secondShort]
