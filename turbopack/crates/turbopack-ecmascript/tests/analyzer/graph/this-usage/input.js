// `this` binds to the nearest enclosing non-arrow function, so each of these
// records `maybe_uses_this` against a different function.

function usesThis() {
  return this.x
}

function doesNotUseThis() {
  return 1
}

// The arrow has no `this` of its own, so this marks `viaArrow`, not the arrow.
function viaArrow() {
  return () => this.x
}

// The inner function binds its own `this`, so only it is marked.
function viaNestedFunction() {
  return function () {
    return this.x
  }
}

// Deeply nested arrows still resolve to the enclosing function.
function viaNestedArrows() {
  return () => () => this.x
}

const arrowAtTopLevel = () => this

const obj = {
  method() {
    return this.x
  },
  notMethod() {
    return 1
  },
  get getter() {
    return this.x
  },
  set setter(v) {
    this.x = v
  },
}

class Klass {
  method() {
    return this.x
  }
  plain() {
    return 1
  }
  constructor() {
    this.x = 1
  }
}

// A direct `eval` can read `this` without naming it.
function viaEval() {
  return eval('this')
}

// So can a `with` block, by resolving a bare name against the scrutinee.
function viaWith(o) {
  with (o) {
    return x
  }
}

export {
  viaEval,
  viaWith,
  usesThis,
  doesNotUseThis,
  viaArrow,
  viaNestedFunction,
  viaNestedArrows,
  arrowAtTopLevel,
  obj,
  Klass,
}
