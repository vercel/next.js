let x = 1;
let y = "hello";

export function a() {
  require(x);
}

export function b() {
  y = "world";
}

export function c() {
  x = y + ".js";
}
