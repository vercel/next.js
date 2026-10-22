export function sum(left, right) {
  return left + right
}

export class Counter {
  constructor(value) {
    this.value = value
  }
  read() {
    return this.value
  }
}

export const state = {
  nested: {
    read(value) {
      return value + 1
    },
  },
}
