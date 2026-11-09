import { right } from './right.js'

console.log('left')

export const name = 'left'

export const left = () => `left ${right()}`
