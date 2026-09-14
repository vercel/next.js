export function method() {
  return this === undefined ? 'no-this' : 'has-this'
}

export function tag(strings) {
  return this === undefined ? 'no-this' : 'has-this'
}

export class Klass {
  constructor() {
    this.ok = 'constructed'
  }
}

export const value = 41

export const nested = {
  deep() {
    return this === undefined ? 'no-this' : 'has-this'
  },
}
