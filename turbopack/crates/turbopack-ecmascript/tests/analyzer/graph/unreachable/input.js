function a() {
  a1();
  return;
  a2();
}

function b() {
  while (false) {
    b1();
    return;
    b2();
  }
  b3();
}

function c() {
  do {
    c1();
    return;
    c2();
  } while (false);
  c3();
}

function d() {
  for (;;) {
    d1();
    return;
    d2();
  }
  d3();
}

function e() {
  for (var x in {}) {
    e1();
    return;
    e2();
  }
  e3();
}

function f() {
  for (var y of []) {
    f1();
    return;
    f2();
  }
  f3();
}

function g() {
  try {
    g1();
    return;
    g2();
  } catch (e) {
    g3();
  }
}

function h() {
  const x = () => {
    h1();
    return;
    h2();
  };
  h3();
}
