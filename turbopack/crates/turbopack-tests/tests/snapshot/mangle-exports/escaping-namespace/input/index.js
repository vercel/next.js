import * as escaping from './escaping.js'
import { someLongExportName, anotherLongExportName } from './mangled.js'

const leak = () => escaping

console.log(leak(), someLongExportName, anotherLongExportName)
