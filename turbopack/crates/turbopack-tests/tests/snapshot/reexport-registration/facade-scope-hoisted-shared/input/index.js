import * as source from './x'

console.log(source)
import('./reexports').then((namespace) => console.log(namespace))
