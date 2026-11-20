let FOO1
function f() {
  // The result of the assignment (the whole `process.env` object) is returned
  return ({ FOO1 } = process.env)
}
console.log(f(), FOO1)
