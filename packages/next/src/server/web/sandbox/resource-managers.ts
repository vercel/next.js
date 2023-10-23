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
  NodeJS.Timeout,
  Parameters<typeof setInterval>
> {
  create(setIntervalParameters: Parameters<typeof setInterval>) {
    return setInterval(...setIntervalParameters)
  }

  destroy(interval: NodeJS.Timeout) {
    clearInterval(interval)
  }
}

class TimeoutsManager extends ResourceManager<
  NodeJS.Timeout,
  Parameters<typeof setTimeout>
> {
  create(setTimeoutParameters: Parameters<typeof setTimeout>) {
    return setTimeout(...setTimeoutParameters)
  }

  destroy(timeout: NodeJS.Timeout) {
    clearTimeout(timeout)
  }
}

export const intervalsManager = new IntervalsManager()
export const timeoutsManager = new TimeoutsManager()
