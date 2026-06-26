'use server'

async function Component({ foo }) {
  const a = 123

  async function fn() {
    'use cache'
    console.log(a)
    return { foo }
  }

  const data = await fn()
  // @ts-ignore: data is not a valid react child
  return <div>{data}</div>
}
