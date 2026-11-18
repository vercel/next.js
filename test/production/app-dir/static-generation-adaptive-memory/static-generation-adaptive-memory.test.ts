import { nextTestSetup } from 'e2e-utils'

type ProbeObservation = {
  kind: 'probe' | 'pin'
  round: number
  slot: number
  workerId: string
  allocated: number
  rss: number
}

type Observation =
  | { kind: 'pool'; size: number }
  | ProbeObservation
  | {
      kind: 'phase'
      phase: string
      slots: number
      machineMemoryLimit: number
      idleAllocated: number
      idleRss: number
    }
  | {
      kind: 'step'
      phase: string
      slot: number
      workerId: string
      rssLimit: number
      submitted: number
    }

// This verifies the local CLI's physical worker pool, IPC pinning, and memory
// probes. A deployment cannot expose those processes or preload their sensors.
describe('static-generation-adaptive-memory', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NODE_OPTIONS: '--require ./observe-workers.cjs' },
  })

  it('reserves memory retained by workers outside a shrinking render phase', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const observations: Observation[] = (
      await next.readFile('worker-memory-observations.jsonl')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(observations.filter((entry) => entry.kind === 'pool')).toEqual([
      { kind: 'pool', size: 3 },
    ])

    const phases = observations.filter((entry) => entry.kind === 'phase')
    const measurements = observations.filter(
      (entry): entry is ProbeObservation =>
        entry.kind === 'probe' || entry.kind === 'pin'
    )
    const allSteps = observations.filter((entry) => entry.kind === 'step')
    expect(phases.map(({ phase, slots }) => [phase, slots])).toEqual([
      ['initial', 2],
      ['final', 1],
    ])

    let initialWorkers: string[] | undefined
    for (const [index, phase] of phases.entries()) {
      const probes = measurements
        .filter((entry) => entry.kind === 'probe' && entry.round === index + 1)
        .sort((a, b) => a.slot - b.slot)
      expect(probes.map((entry) => entry.slot)).toEqual([0, 1, 2])
      const workers = probes.map((entry) => entry.workerId)
      expect(new Set(workers).size).toBe(3)
      if (initialWorkers) expect(workers).toEqual(initialWorkers)
      else initialWorkers = workers

      const repeated = measurements.filter(
        (entry) => entry.kind === 'pin' && entry.round === index + 1
      )
      expect(repeated.map((entry) => entry.workerId)).toEqual([
        workers[0],
        workers[0],
      ])

      const idle = probes.slice(phase.slots)
      expect(phase.idleAllocated).toBe(
        idle.reduce((sum, entry) => sum + entry.allocated, 0)
      )
      expect(phase.idleRss).toBe(
        idle.reduce((sum, entry) => sum + entry.rss, 0)
      )

      const steps = allSteps.filter((entry) => entry.phase === phase.phase)
      expect(new Set(steps.map((entry) => entry.slot)).size).toBe(phase.slots)
      for (const step of steps) {
        expect(step.workerId).toBe(workers[step.slot])
      }
      if (phase.phase === 'final') {
        // Two idle workers now retain 90% of the machine budget. Rendering
        // must use the zero-budget progress path rather than forget them.
        expect(phase.idleAllocated).toBeGreaterThan(
          phase.machineMemoryLimit * 0.85
        )
        expect(steps.length).toBeGreaterThan(0)
        for (const step of steps) {
          expect(step.rssLimit).toBe(0)
          expect(step.submitted).toBeLessThanOrEqual(1)
        }
      }
    }

    const manifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    for (let id = 0; id < 12; id++) {
      expect(manifest.routes[`/items/${id}`]).toBeDefined()
    }
  })
})
