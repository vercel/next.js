import * as first from './first'
import { sameLongExportName as second, a as secondShort } from './second'
import { sameLongExportName as third, a as thirdShort } from './third'

// The factory entry keeps its namespace; the other two members share a flat table.
console.log(Object.keys(first), first, second, third, secondShort, thirdShort)
import('./lazy').then(({ read }) => console.log(read()))
