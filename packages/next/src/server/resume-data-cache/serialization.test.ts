import { stringifyResumeDataCache, parseResumeDataCache } from './serialization'
import {
  createMutableResumeDataCache,
  sealResumeDataCache,
} from './resume-data-cache'
import { streamFromString } from '../stream-utils/node-web-streams-helper'

describe('stringifyResumeDataCache', () => {
  it('serializes an empty cache', async () => {
    const cache = sealResumeDataCache(createMutableResumeDataCache())
    expect(await stringifyResumeDataCache(cache)).toBe('null')
  })

  it('serializes a cache with a single entry', async () => {
    const cache = createMutableResumeDataCache()
    cache.cache.set(
      'key',
      Promise.resolve({
        value: streamFromString('value'),
        tags: [],
        stale: 0,
        timestamp: 0,
        expire: 0,
        revalidate: 0,
      })
    )

    expect(
      await stringifyResumeDataCache(sealResumeDataCache(cache))
    ).toMatchInlineSnapshot(
      `"{"store":{"fetch":{},"cache":{"key":{"value":"dmFsdWU=","tags":[],"stale":0,"timestamp":0,"expire":0,"revalidate":0}}}}"`
    )
  })
})

describe('parseResumeDataCache', () => {
  it('parses an empty cache', () => {
    expect(parseResumeDataCache('null')).toEqual(
      sealResumeDataCache(createMutableResumeDataCache())
    )
  })
})
