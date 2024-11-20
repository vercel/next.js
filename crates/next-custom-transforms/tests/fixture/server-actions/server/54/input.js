function createObj(n) {
  const m = n + 1

  return {
    async foo() {
      'use cache'
      return n * m
    },
    async bar() {
      'use server'
      console.log(m)
    },
  }
}
