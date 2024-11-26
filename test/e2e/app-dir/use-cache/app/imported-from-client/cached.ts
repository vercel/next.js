'use cache'

export async function bar() {
  const v = Math.random()
  console.log(v)
  return v
}

const baz = async () => {
  const v = Math.random()
  console.log(v)
  return v
}

export { baz }
