import { lazy } from './library/lazy.js'

globalThis.deferEvents.push('reads-lazy')

export const readsLazy = { name: lazy.name }
