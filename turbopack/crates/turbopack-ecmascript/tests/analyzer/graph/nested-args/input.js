function x(a) {
  return function y(b) {
    return a + b;
  }
}
const v1 = x(1)(2);

function r(a) {
  if(a % 2 === 0) {
    return a;
  } else {
    return r(a + 1) + 1;
  }
}
const v2 = r(2);

function outer(a) {
  function inner(b) {
    return a + b;
  }

  return inner("b")
}
const v3 = outer("a");
