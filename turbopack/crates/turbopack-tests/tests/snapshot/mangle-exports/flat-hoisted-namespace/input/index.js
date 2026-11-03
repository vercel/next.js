import { sameLongExportName as first, a as firstShort } from './first'
import * as second from './second'

console.log(first, firstShort, Object.keys(second), second)
import('./lazy').then(({ read }) => console.log(read()))
