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
