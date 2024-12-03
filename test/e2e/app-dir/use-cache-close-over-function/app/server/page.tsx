function createCachedFn(start: number) {
  function fn1() {
    return start
  }

  function fn2() {
    return Math.random()
  }

  return async () => {
    'use cache'
    return fn1() + fn2()
  }
}

const getCachedValue = createCachedFn(42)

export default async function Page() {
  return <p>{getCachedValue()}</p>
}
