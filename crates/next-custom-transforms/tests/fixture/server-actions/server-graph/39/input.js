'use server'

async function Component({ foo }) {
  const a = 123

  async function fn() {
    'use cache'
    console.log(a)
    return { foo }
  }

  const data = await fn()
  return <div>{data}</div>
}
