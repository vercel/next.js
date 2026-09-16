export function method() {
  return this === undefined ? 'no-this' : 'has-this'
}

export function tag(strings) {
  return this === undefined ? 'no-this' : 'has-this'
}

export class Klass {
  constructor() {
    this.ok = 'constructed'
  }
}

export const value = 41

export const nested = {
  deep() {
    return this === undefined ? 'no-this' : 'has-this'
  },
}

// A reassignable export: its declared value ignores `this`, but the value it is
// reassigned to does not.
export let swappable = () => 'no-this'

export function swap() {
  swappable = function () {
    return this === undefined ? 'no-this' : 'has-this'
  }
}

export const readOnly = 1

// A direct `eval` can read `this` without it appearing in the source.
export function viaEval() {
  return eval('this === undefined ? "no-this" : "has-this"')
}

// A class body binds `this` without being a function. The `this` in the method, in
// the field initializer and in the static block all belong to the class, so
// `usesOnlyClassThis` itself never observes a receiver of its own.
export function usesOnlyClassThis() {
  class Inner {
    field = this
    static {
      this.tag = 'static-block'
    }
    m() {
      return this.x
    }
  }
  return Inner
}
