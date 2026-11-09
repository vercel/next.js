import * as left from './left.js'
import { leaf } from './leaf.js'

console.log('right')

export const right = () => `right ${left.name} ${leaf}`
