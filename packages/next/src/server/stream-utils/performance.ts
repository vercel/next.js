class PerformanceTransformStreamInitiator extends TransformStream {
  initialized = false
  constructor(id: string, name: string, details?: any) {
    super({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        if (!this.initialized) {
          performance.mark(`${id}-initiator-first-byte`, {
            detail: { name, ...details },
          })
          this.initialized = true
        }
      },
      flush: () => {
        performance.mark(`${id}-initiator-last-byte`, {
          detail: { name, ...details },
        })
      },
    })
  }
}

class PerformanceTransformStreamTerminator extends TransformStream {
  initialized = false
  constructor(id: string, name: string, details?: any) {
    super({
      transform: (chunk, controller) => {
        controller.enqueue(chunk)
        if (!this.initialized) {
          performance.mark(`${id}-terminator-first-byte`, {
            detail: { name, ...details },
          })
          this.initialized = true
        }
      },
      flush: () => {
        performance.mark(`${id}-terminator-last-byte`, {
          detail: { name, ...details },
        })

        try {
          const m = performance.measure(`total time ${id} ${name}`, {
            detail: { name, ...details },
            start: `${id}-initiator-first-byte`,
            end: `${id}-terminator-last-byte`,
          })

          console.log(JSON.stringify(m.toJSON()))
        } catch {}
      },
    })
  }
}

export class TransformStreamPerformanceController {
  id: string
  initiator: PerformanceTransformStreamInitiator
  terminator: PerformanceTransformStreamTerminator
  constructor(name: string, details?: any) {
    this.id = Math.random().toString(16).slice(2)
    this.initiator = new PerformanceTransformStreamInitiator(
      this.id,
      name,
      details
    )
    this.terminator = new PerformanceTransformStreamTerminator(
      this.id,
      name,
      details
    )
  }
}
