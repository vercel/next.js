// based on https://github.com/sindresorhus/p-queue (MIT)
// modified for browser support

class Queue {
  constructor () {
    this._queue = []
  }
  enqueue (run) {
    this._queue.push(run)
  }
  dequeue () {
    return this._queue.shift()
  }
  get size () {
    return this._queue.length
  }
}

export default class PQueue {
  constructor (opts) {
    opts = Object.assign({
      concurrency: Infinity,
      queueClass: Queue
    }, opts)

    if (opts.concurrency < 1) {
      throw new TypeError('Expected `concurrency` to be a number from 1 and up')
    }

    this.queue = new opts.queueClass() // eslint-disable-line new-cap
    this._pendingCount = 0
    this._concurrency = opts.concurrency
    this._resolveEmpty = () => {}
  }
  _next () {
    this._pendingCount--

    if (this.queue.size > 0) {
      this.queue.dequeue()()
    } else {
      this._resolveEmpty()
    }
  }
  add (fn, opts) {
    return new Promise((resolve, reject) => {
      const run = () => {
        this._pendingCount++

        fn().then(
          val => {
            resolve(val)
            this._next()
          },
          err => {
            reject(err)
            this._next()
          }
        )
      }

      if (this._pendingCount < this._concurrency) {
        run()
      } else {
        this.queue.enqueue(run, opts)
      }
    })
  }
  onEmpty () {
    return new Promise(resolve => {
      const existingResolve = this._resolveEmpty
      this._resolveEmpty = () => {
        existingResolve()
        resolve()
      }
    })
  }
  get size () {
    return this.queue.size
  }
  get pending () {
    return this._pendingCount
  }
}
