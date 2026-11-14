import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getStaticGenerationProfileDir,
  getStaticGenerationProfiler,
  readProfileRecords,
  STATIC_GENERATION_PROFILE_ENV,
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

  it('handles more pages than fit in a function call', () => {
    const records: ProfileRecord[] = []
    for (let i = 0; i < 300_000; i++) {
      records.push(page(i % 2 ? 'w1' : 'w2', i, i + 10))
    }
    const summary = summarizeStaticGenerationProfile(records)!
    expect(summary.pages).toBe(300_000)
    expect(summary.windowMs).toBe(300_009)
  })
})

describe('StaticGenerationProfiler', () => {
  const originalEnv = process.env[STATIC_GENERATION_PROFILE_ENV]
  let distDir: string

  beforeEach(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-gen-profile-'))
    process.env[STATIC_GENERATION_PROFILE_ENV] = '1'
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[STATIC_GENERATION_PROFILE_ENV]
    } else {
      process.env[STATIC_GENERATION_PROFILE_ENV] = originalEnv
    }
    fs.rmSync(distDir, { recursive: true, force: true })
  })

  it('records the final interval of a call that ends before the next tick', () => {
    const profiler = getStaticGenerationProfiler()!
    const call = profiler.beginCall(distDir)
    const started = profiler.beginPage()
    // Busy for well under the 100ms sampling interval.
    const until = Date.now() + 30
    while (Date.now() < until) {}
    profiler.endPage(started, {
      phase: 'initial',
      page: '/p',
      path: '/p/1',
      result: undefined,
    })
    call.end('initial', 1)

    const records = readProfileRecords(getStaticGenerationProfileDir(distDir))
    const samples = records.filter((r) => r.type === 'sample')
    expect(samples.length).toBeGreaterThan(0)
    const summary = summarizeStaticGenerationProfile(records)!
    expect(summary.perWorker[0].peakRss).toBeGreaterThan(0)
    expect(summary.perWorker[0].cpuActivePct).toBeGreaterThan(50)
  })
})
