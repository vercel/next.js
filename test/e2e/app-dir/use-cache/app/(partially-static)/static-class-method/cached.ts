export class Cached {
  static async getRandomValue() {
    'use cache'
    const v = Math.random()
    console.log(v)
    return v
  }
}
