'use cache'

function getRandomValue() {
  const v = Math.random()
  console.log(v)
  return v
}

export async function foo() {
  return getRandomValue()
}

export const bar = async function () {
  return getRandomValue()
}

const baz = async () => {
  return getRandomValue()
}

export { baz }
