import './patch-other.js'
import { patch as patch2 } from './patch.js'

export const bar = (patch) => patch + 1
export const foo = (patch) => patch !== patch2
