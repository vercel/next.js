async function foo() {
  const { foo } = await import('some-module')
  return foo()
}

exports.foo = foo
