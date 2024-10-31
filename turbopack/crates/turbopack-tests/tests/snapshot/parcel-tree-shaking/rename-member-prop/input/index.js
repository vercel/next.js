import {B} from "./b.js";

export function foo(x) {
  return [x.foo, x?.foo, x[B], x?.[B]];
}

output = foo;
