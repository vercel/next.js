import * as lit from './lit.js'

// A string-literal key narrows to `foo`, so `unused` leaves the bundle.
console.log(lit['foo'])
