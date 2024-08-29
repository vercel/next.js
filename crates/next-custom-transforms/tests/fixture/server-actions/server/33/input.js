async function fn() {
  'use cache'
  return 'hello'
}

export async function Component() {
  const data = await fn()
  return <div>{data}</div>
}
