export function createCached(n: number) {
  return {
    async getRandomValue() {
      'use cache: remote'
      const v = n + Math.random()
      console.log(v)
      return v
    },
  }
}
