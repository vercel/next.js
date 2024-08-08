/*
    This is a simple promise queue that allows you to limit the number of concurrent promises
    that are running at any given time. It's used to limit the number of concurrent
    prefetch requests that are being made to the server but could be used for other
    things as well.
*/
export class PromiseQueue {
  #maxConcurrency: number
  #runningCount: number
  #queue: Array<{
    promiseFn: Promise<any>
    task: () => void
  }>

  constructor(maxConcurrency = 5) {
    this.#maxConcurrency = maxConcurrency
    this.#runningCount = 0
    this.#queue = []
  }

  enqueue<T>(promiseFn: () => Promise<T>): Promise<T> {
    let taskResolve: (value: T | PromiseLike<T>) => void
    let taskReject: (reason?: any) => void

    const taskPromise = new Promise((resolve, reject) => {
      taskResolve = resolve
      taskReject = reject
    }) as Promise<T>

    const task = async () => {
      try {
        this.#runningCount++
        const result = await promiseFn()
        taskResolve(result)
      } catch (error) {
        taskReject(error)
      } finally {
        this.#runningCount--
        this.#processNext()
      }
    }

    const enqueueResult = { promiseFn: taskPromise, task }
    // wonder if we should take a LIFO approach here
    this.#queue.push(enqueueResult)
    this.#processNext()

    return taskPromise
  }

  bump(promiseFn: Promise<any>) {
    const index = this.#queue.findIndex((item) => item.promiseFn === promiseFn)

    if (index > -1) {
      const bumpedItem = this.#queue.splice(index, 1)[0]
      this.#queue.unshift(bumpedItem)
      this.#processNext(true)
    }
  }

  #processNext(forced = false) {
    if (
      (this.#runningCount < this.#maxConcurrency || forced) &&
      this.#queue.length > 0
    ) {
      this.#queue.shift()?.task()
    }
  }
}
