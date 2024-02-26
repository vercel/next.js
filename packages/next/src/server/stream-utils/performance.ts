class PerformanceTransformStreamInitiator extends TransformStream {
  initialized = false
  constructor(id: string, name: string) {
    super({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        if (!this.initialized) {
          performance.mark(`${id}-initiator-first-byte`, { detail: { name } })
          this.initialized = true
        }
      },
      flush: () => {
        performance.mark(`${id}-initiator-last-byte`, {
          detail: { name },
        })
      },
    })
  }
}

class PerformanceTransformStreamTerminator extends TransformStream {
  initialized = false
  constructor(id: string, name: string) {
    super({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        if (!this.initialized) {
          performance.mark(`${id}-terminator-first-byte`, { detail: { name } })
          this.initialized = true
        }
      },
      flush: () => {
        performance.mark(`${id}-terminator-last-byte`, {
          detail: { name },
        })

        try {
          const m = performance.measure(
            `total time ${id} ${name}`,
            `${id}-initiator-first-byte`,
            `${id}-terminator-last-byte`
          )

          console.log(m)
        } catch {}
      },
    })
  }
}

export class TransformStreamPerformanceController {
  id: string
  initiator: PerformanceTransformStreamInitiator
  terminator: PerformanceTransformStreamTerminator
  constructor(name: string) {
    this.id = Math.random().toString(16).slice(2)
    this.initiator = new PerformanceTransformStreamInitiator(this.id, name)
    this.terminator = new PerformanceTransformStreamTerminator(this.id, name)
  }
}
