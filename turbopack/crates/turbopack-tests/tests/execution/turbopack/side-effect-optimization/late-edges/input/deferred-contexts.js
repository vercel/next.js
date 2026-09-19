import { value } from './pure-dep.js'

export function declaration() {
  return import('./deferred-effect.js')
}

export const arrow = () => import('./deferred-effect.js')
export const expression = function () {
  return require('./deferred-effect.js')
}

export class DeferredContexts {
  field = import('./deferred-effect.js')

  constructor() {
    require('./deferred-effect.js')
  }

  method() {
    return import('./deferred-effect.js')
  }

  get loaded() {
    return require('./deferred-effect.js')
  }

  set loaded(value) {
    if (value) require('./deferred-effect.js')
  }
}

export const derived = value + 1
