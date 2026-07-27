function createCachedFn(start: number) {
  function fn() {
    return start
  }

  return async () => {
    'use cache'
    return Math.random() + fn()
  }
}

const getCachedValue = createCachedFn(42)

export default async function Page() {
  return <p>{getCachedValue()}</p>
}
