function createCacheFn() {
  return async () => {
    'use cache'
    throw new Error('kaputt!')
  }
}

const cached = createCacheFn()

export default async function Page() {
  return <p>A page with an anonymous cache function. {await cached()}</p>
}
