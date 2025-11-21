export function createCached(n: number) {
  return {
    async getRandomValue() {
      'use cache'
      const v = n + Math.random()
      console.log(v)
      return v
    },
  }
}
