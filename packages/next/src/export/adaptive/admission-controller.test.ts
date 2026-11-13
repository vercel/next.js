import {
  AdmissionController,
  createAdmissionConfig,
  type AdmissionSample,
} from './admission-controller'

const MB = 1024 * 1024
const HEAP_LIMIT = 1000 * MB

function sampler(controller: AdmissionController) {
  let now = 0
  return (sample: Partial<AdmissionSample>) => {
    now += 250
    controller.update({
      now,
      elu: 0.2,
      heapUsed: 100 * MB,
      postGcHeap: undefined,
      rss: 200 * MB,
      running: controller.concurrency,
      heapLimit: HEAP_LIMIT,
      rssLimit: undefined,
      ...sample,
    })
  }
}

describe('AdmissionController', () => {
  it('starts at the initial window and respects the configured maximum', () => {
    expect(new AdmissionController(createAdmissionConfig({})).concurrency).toBe(
      8
    )
    const capped = new AdmissionController(
      createAdmissionConfig({ maxConcurrency: 4 })
    )
    expect(capped.concurrency).toBe(4)
    const update = sampler(capped)
    for (let i = 0; i < 20; i++) update({ postGcHeap: 50 * MB })
    expect(capped.concurrency).toBe(4)
  })

  it('grows while the event loop is idle and memory has headroom', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ postGcHeap: 80 * MB, running: 1 })
    for (let i = 0; i < 20; i++) {
      // Each page costs ~5MB above the 80MB baseline.
      update({ heapUsed: (80 + 5 * controller.concurrency) * MB })
    }
    expect(controller.concurrency).toBe(64)
  })

  it('does not grow when the window is not full', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    for (let i = 0; i < 10; i++) update({ running: 3 })
    expect(controller.concurrency).toBe(8)
  })

  it('stops growing when the estimated cost of more pages exceeds the headroom', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ postGcHeap: 100 * MB, running: 1 })
    for (let i = 0; i < 40; i++) {
      // ~40MB per page: 8 pages = 420MB, so only a little more fits under
      // 75% of 1000MB.
      update({ heapUsed: (100 + 40 * controller.concurrency) * MB })
    }
    // 8 -> 10 -> 13. At 13 pages (620MB), the next step (+4 pages * 40MB *
    // 1.5 safety = 240MB) would cross the 750MB high-water mark.
    expect(controller.concurrency).toBe(13)
  })

  it('when CPU bound, shrinks a grown window back to the initial window, not below', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ postGcHeap: 80 * MB, running: 1 })
    for (let i = 0; i < 4; i++) update({ heapUsed: 100 * MB })
    expect(controller.concurrency).toBeGreaterThan(8)
    for (let i = 0; i < 60; i++) update({ elu: 1 })
    expect(controller.concurrency).toBe(8)
  })

  it('applies hysteresis: refuses above high water until below low water', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)

    update({ heapUsed: 700 * MB, running: 4 })
    expect(controller.state.saturated).toBe(false)
    expect(controller.acceptable(4, 0, 2)).toBeGreaterThan(0)

    update({ heapUsed: 760 * MB, running: 4 })
    expect(controller.state.saturated).toBe(true)
    expect(controller.acceptable(4, 0, 2)).toBe(0)
    // Stops adding: the window shrinks to what is running.
    expect(controller.concurrency).toBe(4)

    // Between the marks: still refusing.
    update({ heapUsed: 700 * MB, running: 3 })
    expect(controller.state.saturated).toBe(true)
    expect(controller.acceptable(3, 0, 2)).toBe(0)

    // Below low water: accepting again.
    update({ heapUsed: 600 * MB, running: 3 })
    expect(controller.state.saturated).toBe(false)
    expect(controller.acceptable(3, 0, 2)).toBeGreaterThan(0)
  })

  it('always accepts one page on an idle worker so the build makes progress', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ heapUsed: 950 * MB, running: 0 })
    expect(controller.acceptable(0, 0, 2)).toBe(1)
    expect(controller.acceptable(1, 0, 2)).toBe(0)
  })

  it('halves the window above the critical mark', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ heapUsed: 920 * MB, running: 8 })
    expect(controller.concurrency).toBe(4)
    update({ heapUsed: 920 * MB, running: 4 })
    expect(controller.concurrency).toBe(2)
  })

  it('uses the RSS budget when it is tighter than the heap limit', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ heapUsed: 100 * MB, rss: 800 * MB, rssLimit: 1000 * MB })
    expect(controller.state.saturated).toBe(true)
  })

  it('with raw RSS near the budget, only grows back to windows it already used', () => {
    const controller = new AdmissionController(createAdmissionConfig({}))
    const update = sampler(controller)
    update({ postGcHeap: 80 * MB, running: 1 })
    // Grow to 13 with plenty of memory.
    for (let i = 0; i < 2; i++) update({ heapUsed: 100 * MB })
    expect(controller.concurrency).toBe(13)
    // A burst pushes allocated memory past the critical mark: halve.
    update({ heapUsed: 950 * MB, running: 13 })
    expect(controller.concurrency).toBe(6)
    // Memory is freed, but RSS stays near the budget.
    for (let i = 0; i < 20; i++) {
      update({
        heapUsed: 100 * MB,
        rss: 300 * MB,
        rawRss: 950 * MB,
        rssLimit: 1000 * MB,
      })
    }
    expect(controller.state.saturated).toBe(false)
    expect(controller.concurrency).toBe(13)
  })
})
