import { upper } from "module";
export let foobar = "foo";
export const foo = foobar;
const bar = "bar";
foobar += bar;
let foobarCopy = foobar;
foobar += "foo";
console.log(foobarCopy);
foobarCopy += "Unused";
function internal() {
  return upper(foobar);
}
export function external1() {
  return internal() + foobar;
}
export function external2() {
  foobar += ".";
}
