import { sameLongExportName as first, a as firstShort } from './first'
import { sameLongExportName as second, a as secondShort } from './second'

console.log(first, second, firstShort, secondShort)
import('./lazy').then(({ read }) => console.log(read()))
