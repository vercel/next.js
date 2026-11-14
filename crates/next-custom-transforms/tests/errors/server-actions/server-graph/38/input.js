export class Foo {
  constructor() {
    'use client'
  }
}

export const obj = {
  get value() {
    'use client'
  },
  set value(v) {
    'use client'
  },
}

export class Bar {
  static {
    'use client'
  }
}
