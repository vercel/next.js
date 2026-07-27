function createCachedFn(start) {
  function fn() {
    return start + Math.random()
  }

  return async () => {
    'use cache'
    return fn()
  }
}

function createServerAction(start) {
  function fn() {
    return start + Math.random()
  }

  return async () => {
    'use server'
    console.log(fn())
  }
}
