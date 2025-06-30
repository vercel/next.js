/// <reference types="./query-id.d.ts" />
import { randomString } from './random-string.js'
export function createQueryId() {
  return new LazyQueryId()
}
class LazyQueryId {
  #queryId
  get queryId() {
    if (this.#queryId === undefined) {
      this.#queryId = randomString(8)
    }
    return this.#queryId
  }
}
