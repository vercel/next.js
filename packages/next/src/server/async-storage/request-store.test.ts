import type { ImplicitTags } from '../lib/implicit-tags'
import { createRequestStore } from './request-store'

const baseInputs = {
  phase: 'render' as const,
  onUpdateCookies: undefined,
  url: { pathname: '/', search: '' },
  rootParams: {},
  implicitTags: {} as ImplicitTags,
  resumeDataCache: null,
  previewProps: undefined,
  isHmrRefresh: false,
  serverComponentsHmrCache: undefined,
  fallbackParams: null,
}

describe('createRequestStore', () => {
  it('merges valid middleware cookies into request and mutable cookies', () => {
    const store = createRequestStore({
      ...baseInputs,
      headers: {
        'x-middleware-set-cookie': 'first=one, second=two%20words; Path=/',
      },
    })

    expect(store.cookies.get('first')).toEqual({
      name: 'first',
      value: 'one',
    })
    expect(store.cookies.get('second')).toEqual({
      name: 'second',
      value: 'two words',
    })
    expect(store.mutableCookies.get('second')).toEqual({
      name: 'second',
      value: 'two words',
      path: '/',
    })
  })

  it('ignores malformed middleware cookies while preserving valid ones', () => {
    const store = createRequestStore({
      ...baseInputs,
      headers: {
        'x-middleware-set-cookie': 'valid=ok; Path=/, malformed=bad%',
      },
    })

    expect(() => store.cookies.getAll()).not.toThrow()
    expect(() => store.mutableCookies.getAll()).not.toThrow()
    expect(store.cookies.get('valid')).toEqual({ name: 'valid', value: 'ok' })
    expect(store.mutableCookies.get('valid')).toEqual({
      name: 'valid',
      value: 'ok',
      path: '/',
    })
    expect(store.cookies.get('malformed')).toBeUndefined()
    expect(store.mutableCookies.get('malformed')).toBeUndefined()
  })
})
