'use cache'

// Expect no error here, this is allowed to be sync because it's not exported.
function Foo() {
  const v = Math.random()
  console.log(v)
  return v
}

export async function bar() {
  return <Foo />
}
