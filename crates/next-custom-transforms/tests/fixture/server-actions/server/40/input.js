async function Component({ a }) {
  const b = 1

  async function action(c) {
    'use server'
    const d = a + b + c

    async function cache(e) {
      'use cache'
      const f = d + e

      return [f, { a }]
    }

    return cache(d)
  }

  return (
    <form action={action}>
      <button>Submit</button>
    </form>
  )
}
