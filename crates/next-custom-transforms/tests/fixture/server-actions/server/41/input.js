'use cache'

export async function Component({ foo }) {
  const a = 123

  async function fn() {
    'use server'
    console.log(a)
    return { foo }
  }

  const data = await fn()
  return <div>{data}</div>
}
