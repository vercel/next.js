const v = 'world'

async function fn() {
  'use cache'
  return 'hello, ' + v
}

export async function Component() {
  const data = await fn()
  return <div>{data}</div>
}
