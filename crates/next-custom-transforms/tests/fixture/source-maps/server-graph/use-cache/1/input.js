'use cache'

const foo = async () => {
  'use cache'
}

export async function bar() {
  return foo()
}
