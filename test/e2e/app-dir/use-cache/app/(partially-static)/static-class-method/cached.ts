export class Cached {
  static async getRandomValue() {
    'use cache: remote'
    const v = Math.random()
    console.log(v)
    return v
  }
}
