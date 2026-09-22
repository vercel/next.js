import { value } from './pure-dep.js'

const load = () => require('./local-called-effect.cjs')
load()

export const derived = value + 1
