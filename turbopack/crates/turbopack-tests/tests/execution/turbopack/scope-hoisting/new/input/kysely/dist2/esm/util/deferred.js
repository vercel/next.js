/// <reference types="./deferred.d.ts" />
export class Deferred {
  #promise
  #resolve
  #reject
  constructor() {
    this.#promise = new Promise((resolve, reject) => {
      this.#reject = reject
      this.#resolve = resolve
    })
  }
  get promise() {
    return this.#promise
  }
  resolve = (value) => {
    if (this.#resolve) {
      this.#resolve(value)
    }
  }
  reject = (reason) => {
    if (this.#reject) {
      this.#reject(reason)
    }
  }
}
