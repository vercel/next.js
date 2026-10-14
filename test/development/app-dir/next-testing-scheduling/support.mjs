import { appendFileSync, existsSync, watch } from 'node:fs'
import { dirname } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { sum } from './subject.mjs'

export function record(event, file, extra = {}) {
  appendFileSync(
    process.env.NEXT_SCHEDULING_JOURNAL,
    JSON.stringify({
      event,
      file,
      pid: process.pid,
      parent: process.ppid,
      mode: process.env.NODE_ENV,
      ...extra,
    }) + '\n'
  )
}

export function unit(file) {
  let attempts = 0
  beforeAll(async () => {
    expect(globalThis.schedulingFile).toBeUndefined()
    globalThis.schedulingFile = file
    record('start', file)
    const gate = process.env.NEXT_SCHEDULING_GATE
    if (gate) {
      await new Promise((resolve) => {
        const watcher = watch(dirname(gate), () => {
          if (existsSync(gate)) {
            watcher.close()
            resolve()
          }
        })
        if (existsSync(gate)) {
          watcher.close()
          resolve()
        }
      })
    }
  })
  test(`isolates ${file}`, { retry: 1 }, () => {
    record('attempt', file, { attempt: attempts++ })
    expect(globalThis.schedulingFile).toBe(file)
    expect(process.env.NEXT_SCHEDULING_CONFIG_MODE).toBe(process.env.NODE_ENV)
    expect(process.env.NEXT_SCHEDULING_ENV_MODE).toBe(process.env.NODE_ENV)
    expect(
      process.env.NODE_ENV === 'development'
        ? process.env.NEXT_SCHEDULING_PROD_ONLY
        : process.env.NEXT_SCHEDULING_DEV_ONLY
    ).toBeUndefined()
    expect(sum(2, 3)).toBe(5)
    if (file === 'beta' && attempts === 1) throw new Error('EXPECTED_RETRY')
  })
  afterAll(() => record('end', file))
}
