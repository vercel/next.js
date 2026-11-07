import type { NextInstance } from 'e2e-utils'
import { randomUUID } from 'crypto'
import { retry } from 'next-test-utils'
import type {
  CacheControlOptions,
  CacheControlRule,
  CacheOperationRecord,
  CacheGenerationMatcher,
  CacheGenerationOperation,
  CacheGetMatcher,
  CacheGetOperation,
  CacheGetResponseMatcher,
  CacheGetResponseOperation,
  CacheOperation,
  CacheOperationMatcher,
  CacheSetMatcher,
  CacheSetOperation,
  OperationStatus,
} from './fixtures/use-cache-dedup/cache-control-types'

export async function createCacheControl(
  next: NextInstance,
  options: CacheControlOptions
) {
  async function command(body: object) {
    const response = await next.fetch('/write-failure-control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(204)
  }

  async function read() {
    const response = await next.fetch('/write-failure-control')
    expect(response.status).toBe(200)
    return (await response.json()) as CacheOperationRecord[]
  }

  async function register<T extends CacheOperation>(
    match: CacheOperationMatcher,
    action: CacheControlRule['action']
  ) {
    const id = randomUUID()
    await command({ action: 'register', rule: { id, match, action } })

    async function waitForStatus(status?: OperationStatus): Promise<T> {
      let operation: T
      await retry(async () => {
        const record = (await read()).find((item) => item.ruleId === id)
        expect(record).toBeDefined()
        if (status !== undefined) {
          expect(record.status).toBe(status)
        }
        operation = record.operation as T
      })
      return operation
    }

    return {
      waitUntilStarted: () => waitForStatus(),
      waitUntilCompleted: () => waitForStatus('completed'),
      waitUntilRejected: () => waitForStatus('rejected'),
      release: () => command({ action: 'release', id }),
    }
  }

  await command({ action: 'configure', options })

  return {
    async read() {
      const operations = await read()
      return {
        generatedLanguages: operations.flatMap(({ operation }) =>
          operation.type === 'generate' ? [operation.language] : []
        ),
        lookupKeys: operations.flatMap(({ operation }) =>
          operation.type === 'get' ? [operation.cacheKey] : []
        ),
      }
    },
    holdNextGeneration(match: Omit<CacheGenerationMatcher, 'type'>) {
      return register<CacheGenerationOperation>(
        { type: 'generate', ...match },
        'hold'
      )
    },
    holdNextGet(match: Omit<CacheGetMatcher, 'type'>) {
      return register<CacheGetOperation>({ type: 'get', ...match }, 'hold')
    },
    async holdNextGetResponse(match: Omit<CacheGetResponseMatcher, 'type'>) {
      const control = await register<CacheGetResponseOperation>(
        { type: 'get-response', ...match },
        'hold'
      )
      return {
        waitUntilCaptured: control.waitUntilStarted,
        release: control.release,
      }
    },
    holdNextWrite(match: Omit<CacheSetMatcher, 'type'>) {
      return register<CacheSetOperation>({ type: 'set', ...match }, 'hold')
    },
    rejectNextWrite(match: Omit<CacheSetMatcher, 'type'>) {
      return register<CacheSetOperation>({ type: 'set', ...match }, 'reject')
    },
    observeNextWrite(match: Omit<CacheSetMatcher, 'type'>) {
      return register<CacheSetOperation>({ type: 'set', ...match }, 'observe')
    },
    async waitForWrite(
      match: Omit<CacheSetMatcher, 'type'>,
      status: OperationStatus
    ) {
      await retry(async () => {
        expect(
          (await read()).some(
            ({ operation, status: currentStatus }) =>
              operation.type === 'set' &&
              currentStatus === status &&
              (match.tag === undefined || operation.tags.includes(match.tag)) &&
              (match.entry === undefined || operation.entry === match.entry)
          )
        ).toBe(true)
      })
    },
    releaseAll: () => command({ action: 'release-all' }),
  }
}

export async function waitForCrossRequestJoin(
  next: NextInstance,
  id: string,
  keyPart?: string
) {
  await retry(() => {
    expect(
      next.cliOutput
        .split('\n')
        .some(
          (line) =>
            line.includes('joining pending cross-request invocation') &&
            line.includes(id) &&
            (keyPart === undefined || line.includes(keyPart))
        )
    ).toBe(true)
  })
}
