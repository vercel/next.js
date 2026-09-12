import constantDefault, { constant, live, setLive } from './reexport.js'

console.log(constant, constant, { constant }, constantDefault(), live)
setLive('updated')
console.log(live)
