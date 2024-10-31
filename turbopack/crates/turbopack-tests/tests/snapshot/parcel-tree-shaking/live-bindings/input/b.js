var foo = 2;
export default foo;
export {foo, foo as bar};

export function changeFoo(v) {
  foo = v;
}
