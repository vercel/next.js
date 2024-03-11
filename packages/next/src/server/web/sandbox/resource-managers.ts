abstract class ResourceManager<T, K> {
  private resources: T[] = []

  abstract create(resourceArgs: K): T
  abstract destroy(resource: T): void

  add(resourceArgs: K) {
    const resource = this.create(resourceArgs)
    this.resources.push(resource)
    return resource
  }

  remove(resource: T) {
    this.resources = this.resources.filter((r) => r !== resource)
    this.destroy(resource)
  }

  removeAll() {
    this.resources.forEach(this.destroy)
    this.resources = []
  }
}

class IntervalsManager extends ResourceManager<
  number,
  Parameters<typeof setInterval>
> {
  create(args: Parameters<typeof setInterval>) {
    // TODO: use the edge runtime provided `setInterval` instead
    return setInterval(...args)[Symbol.toPrimitive]()
  }

  destroy(interval: number) {
    clearInterval(interval)
  }
}

class TimeoutsManager extends ResourceManager<
  number,
  Parameters<typeof setTimeout>
> {
  create(args: Parameters<typeof setTimeout>) {
    // TODO: use the edge runtime provided `setTimeout` instead
    return setTimeout(...args)[Symbol.toPrimitive]()
  }

  destroy(timeout: number) {
    clearTimeout(timeout)
  }
}

export const intervalsManager = new IntervalsManager()
export const timeoutsManager = new TimeoutsManager()
