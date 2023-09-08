export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

export class Deferred<T> {
  declare promise: Promise<T>
  declare resolve: (v?: T | PromiseLike<T>) => void
  declare reject: (r?: any) => void

  constructor() {
    this.promise = new Promise((res, rej) => {
      this.resolve = res
      this.reject = rej
    })
  }
}
