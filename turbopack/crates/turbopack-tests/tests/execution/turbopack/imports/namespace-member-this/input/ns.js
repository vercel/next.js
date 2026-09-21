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

// A module-eval-scope assignment leaves the binding `Constant`, but it can still
// swap in a function that reads `this`, so the declared value cannot be trusted.
export let reassignedArrow = () => 'no-this'
reassignedArrow = function () {
  return this === undefined ? 'no-this' : 'has-this'
}

// The same holds for a function declaration reassigned at module scope.
export function reassignedFn() {
  return 'no-this'
}
reassignedFn = function () {
  return this === undefined ? 'no-this' : 'has-this'
}

// A destructuring assignment reaches the binding through a pattern rather than a
// plain identifier, but it replaces the value just the same.
export let viaArrayPat = () => 'no-this'
;[viaArrayPat] = [
  function () {
    return this === undefined ? 'no-this' : 'has-this'
  },
]

export let viaObjectPat = () => 'no-this'
;({ viaObjectPat } = {
  viaObjectPat: function () {
    return this === undefined ? 'no-this' : 'has-this'
  },
})

// A function declaration hoists, so this assignment is visited before the
// declaration that records the declared answer.
export function reassignedBeforeDecl() {
  return 'no-this'
}
reassignedBeforeDecl = function () {
  return this === undefined ? 'no-this' : 'has-this'
}

// `export default` of a directly visible function that reads `this` must keep the
// namespace as the receiver, just like a named export.
export default function () {
  return this === undefined ? 'no-this' : 'has-this'
}

// A class rebinds `this` only for its body. The `extends` clause and computed member
// keys are evaluated with the receiver of the enclosing function.
export function viaHeritage() {
  let seen
  class Inner extends ((seen = this === undefined ? 'no-this' : 'has-this'),
  Object) {}
  return seen
}

export function viaComputedMethodKey() {
  let seen
  class Inner {
    [(seen = this === undefined ? 'no-this' : 'has-this')]() {}
  }
  return seen
}

export function viaComputedFieldKey() {
  let seen
  class Inner {
    [(seen = this === undefined ? 'no-this' : 'has-this')] = 1
  }
  return seen
}

// The initializer is a call the analysis cannot see through, so the assignment below,
// which never runs, must not make the binding look `this`-free.
function makeThisReader() {
  return function () {
    return this === undefined ? 'no-this' : 'has-this'
  }
}
export let opaqueInit = makeThisReader()
if (typeof opaqueInit !== 'function') {
  opaqueInit = () => 'no-this'
}

// A `for...of` head assigns the binding without an assignment expression.
export function viaForOf() {
  return 'no-this'
}
for (viaForOf of [
  function () {
    return this === undefined ? 'no-this' : 'has-this'
  },
]) {
  // the loop head is the assignment
}
