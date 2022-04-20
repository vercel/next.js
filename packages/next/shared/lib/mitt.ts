/*
MIT License

Copyright (c) Jason Miller (https://jasonformat.com/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// This file is based on https://github.com/developit/mitt/blob/v1.1.3/src/index.js
// It's been edited for the needs of this script
// See the LICENSE at the top of the file

type EventShape = Record<string, unknown[]>
type AnyEvent = Record<string, any[]>

type Handler<P extends unknown[] = any[]> = (...args: P) => void

export type MittEmitter<T extends EventShape = AnyEvent> = {
  on<K extends keyof T>(type: K, handler: Handler<T[K]>): void
  off<K extends keyof T>(type: K, handler: Handler<T[K]>): void
  emit<K extends keyof T>(type: K, ...args: T[K]): void
}

export default function mitt<T extends EventShape>(): MittEmitter<T> {
  const all: { [K in keyof T]: Handler<T[K]>[] } = Object.create(null)

  return {
    on<K extends keyof T>(type: K, handler: Handler<T[K]>) {
      ;(all[type] || (all[type] = [])).push(handler)
    },

    off<K extends keyof T>(type: K, handler: Handler<T[K]>) {
      if (all[type]) {
        all[type].splice(all[type].indexOf(handler) >>> 0, 1)
      }
    },

    emit<K extends keyof T>(type: K, ...args: T[K]) {
      // eslint-disable-next-line array-callback-return
      ;(all[type] || []).slice().map((handler: Handler<T[K]>) => {
        handler(...args)
      })
    },
  }
}
