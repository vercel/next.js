function a() {
  if (true) {
    a1();
    return;
  }
  a2();
}

function b() {
  if (true) {
    b1();
    return;
  } else {
    b2();
  }
  b3();
}

function c() {
  if (true) {
    return;
  }
  c1();
}

function d() {
  if (true) {
    return;
  } else {
    d1();
  }
  d2();
}

function e() {
  if (false) {
    e1();
  } else {
    return;
  }
  e2();
}

function f() {
  if (false) {
  } else {
    return;
  }
  f1();
}

function g() {
  if (false) {
    g1();
  } else {
    g2();
    return;
  }
  g3();
}

function h() {
  if (false) {
  } else {
    h1();
    return;
  }
  h2();
}

export function i(j) {
  if (j < 1) return i1();
  return i2();
}

export function j(j) {
  if (j < 1) {
    return i1();
  }
  return i2();
}

// A terminal throw must not add an implicit undefined return alternative.
export function returnOrThrow(condition) {
  if (condition) return "value";
  throw makeError();
  afterThrow();
}

export function throwOrReturn(condition) {
  if (condition) {
    throw makeBranchError();
  } else {
    return "value";
  }
  afterBranches();
}

// A conditional throw does not make the rest of the function unreachable.
export function conditionalThrow(condition) {
  if (condition) throw makeConditionalError();
  afterConditionalThrow();
  return "value";
}

// Fallthrough and explicit undefined returns must still be represented.
export function fallthrough(condition) {
  if (condition) throw makeFallthroughError();
}

export function emptyReturn(condition) {
  if (condition) return;
  throw makeEmptyReturnError();
}

export function explicitUndefined(condition) {
  if (condition) return undefined;
  throw makeUndefinedError();
}

// Exiting an inner function must not suppress the outer function's fallthrough.
export function nestedThrow() {
  function inner(condition) {
    if (condition) return "inner";
    throw makeNestedError();
  }
  useInner(inner);
  afterInner();
}
