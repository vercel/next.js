import { UPPER, lower } from './other'
import value from './other' with { turbopackConstants: 'true' }

if (UPPER !== 'x') require('./dead-uppercase')
if (value !== 'dev') require('./dead-default')
console.log(lower)
