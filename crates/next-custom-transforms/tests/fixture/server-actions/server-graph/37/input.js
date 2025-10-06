'use server'

async function fn() {
  'use cache'
  return 'foo'
}

async function Component() {
  const data = await fn()
  return <div>{data}</div>
}
