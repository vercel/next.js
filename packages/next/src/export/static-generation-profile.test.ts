import {
  summarizeStaticGenerationProfile,
  type ProfileRecord,
} from './static-generation-profile'

const page = (
  workerId: string,
  start: number,
  end: number,
  phase: 'initial' | 'final' = 'initial'
): ProfileRecord => ({
  type: 'page',
  workerId,
  phase,
  page: '/p',
  path: `/p/${workerId}/${start}`,
  start,
  end,
  ok: true,
  inFlightAtStart: 0,
})

const sample = (
  workerId: string,
  t: number,
  activeMs: number,
  idleMs: number
): ProfileRecord => ({
  type: 'sample',
  workerId,
  t,
  activeMs,
  idleMs,
  rss: 100,
  heapUsed: 50,
  inFlight: 1,
})

describe('summarizeStaticGenerationProfile', () => {
  it('returns null without pages', () => {
    expect(summarizeStaticGenerationProfile([])).toBeNull()
  })

  it('reports the tail spread and per-worker idle time', () => {
    const summary = summarizeStaticGenerationProfile([
      // w1 renders for the whole window, fully CPU bound.
      page('w1', 0, 500),
      page('w1', 500, 1000),
      sample('w1', 500, 500, 0),
      sample('w1', 1000, 500, 0),
      // w2 finishes after 400ms, and spends half of that waiting on I/O.
      page('w2', 0, 400),
      sample('w2', 400, 200, 200),
      sample('w2', 1000, 0, 600),
      {
        type: 'call',
        workerId: 'w2',
        phase: 'initial',
        start: 0,
        end: 400,
        pages: 1,
        fetchHits: 3,
        fetchMisses: 1,
      },
    ])!

    expect(summary.pages).toBe(3)
    expect(summary.windowMs).toBe(1000)
    expect(summary.tailSpreadMs).toBe(600)
    expect(summary.tailSpreadPct).toBe(60)
    expect(summary.fetchHitRate).toBe(0.75)

    const [w1, w2] = summary.perWorker
    expect(w1).toMatchObject({
      workerId: 'w1',
      cpuActivePct: 100,
      noWorkPct: 0,
      idlePct: 0,
    })
    expect(w2).toMatchObject({
      workerId: 'w2',
      cpuActivePct: 20,
      noWorkPct: 60,
      ioWaitPct: 20,
      idlePct: 80,
      finishOffsetMs: 400,
    })
  })

  it('reports phases separately', () => {
    const summary = summarizeStaticGenerationProfile([
      page('w1', 0, 100, 'initial'),
      page('w2', 0, 300, 'initial'),
      page('w1', 400, 500, 'final'),
    ])!
    expect(summary.phases).toEqual([
      { phase: 'initial', pages: 2, windowMs: 300, tailSpreadMs: 200 },
      { phase: 'final', pages: 1, windowMs: 100, tailSpreadMs: 0 },
    ])
  })
})
