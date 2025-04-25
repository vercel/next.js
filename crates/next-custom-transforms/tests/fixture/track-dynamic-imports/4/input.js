async function foo() {
  await import('./some-file')
  return null
}

exports.foo = foo
