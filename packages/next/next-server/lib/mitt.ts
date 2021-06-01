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

type Handler<Event = any> = (...evts: Event[]) => void

export type MittEmitter<EventType extends string = string, Event = any> = {
  on(type: EventType, handler: Handler<Event>): void
  off(type: EventType, handler: Handler<Event>): void
  emit(type: EventType, ...evts: Event[]): void
}

export default function mitt<
  EventType extends string = string,
  Event = any
>(): MittEmitter<EventType, Event> {
  const all: { [s: string]: Handler[] } = Object.create(null)

  return {
    on(type: EventType, handler: Handler<Event>) {
      ;(all[type] || (all[type] = [])).push(handler)
    },

    off(type: EventType, handler: Handler<Event>) {
      if (all[type]) {
        all[type].splice(all[type].indexOf(handler) >>> 0, 1)
      }
    },

    emit(type: EventType, ...evts: Event[]) {
      // eslint-disable-next-line array-callback-return
      ;(all[type] || []).slice().map((handler: Handler) => {
        handler(...evts)
      })
    },
  }
}
