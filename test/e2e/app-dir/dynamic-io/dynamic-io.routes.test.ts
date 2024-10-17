import { nextTestSetup } from 'e2e-utils'

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliIndex = 0
  beforeEach(() => {
    cliIndex = next.cliOutput.length
  })
  function getLines(containing: string): Array<string> {
    const warnings = next.cliOutput
      .slice(cliIndex)
      .split('\n')
      .filter((l) => l.includes(containing))

    cliIndex = next.cliOutput.length
    return warnings
  }

  it('should not prerender GET route handlers that use dynamic APIs', async () => {
    let str = await next.render('/routes/dynamic-cookies', {})
    let json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toEqual('cookies')

    str = await next.render('/routes/dynamic-headers', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toEqual('headers')

    str = await next.render('/routes/dynamic-stream', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toEqual('dynamic stream')

    str = await next.render('/routes/dynamic-url?foo=bar', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.search).toEqual('?foo=bar')

    str = await next.render('/routes/-edge/dynamic-cookies', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toEqual('cookies')

    str = await next.render('/routes/-edge/dynamic-headers', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toEqual('headers')

    str = await next.render('/routes/-edge/dynamic-stream', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toEqual('dynamic stream')

    str = await next.render('/routes/-edge/dynamic-url?foo=bar', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.search).toEqual('?foo=bar')
  })

  it('should prerender GET route handlers that have entirely cached io (fetches)', async () => {
    let str = await next.render('/routes/fetch-cached', {})
    let json = JSON.parse(str)

    let random1 = json.random1
    let random2 = json.random2

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(typeof random1).toBe('string')
      expect(typeof random2).toBe('string')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(typeof random1).toBe('string')
      expect(typeof random2).toBe('string')
    }

    str = await next.render('/routes/fetch-cached', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(random1).toEqual(json.random1)
      expect(random2).toEqual(json.random2)
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(random1).toEqual(json.random1)
      expect(random2).toEqual(json.random2)
    }

    str = await next.render('/routes/-edge/fetch-cached', {})
    json = JSON.parse(str)

    random1 = json.random1
    random2 = json.random2

    expect(json.value).toEqual('at runtime')
    expect(typeof random1).toBe('string')
    expect(typeof random2).toBe('string')

    str = await next.render('/routes/-edge/fetch-cached', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(random1).toEqual(json.random1)
    expect(random2).toEqual(json.random2)
  })

  it('should not prerender GET route handlers that have some uncached io (fetches)', async () => {
    let str = await next.render('/routes/fetch-mixed', {})
    let json = JSON.parse(str)

    let random1 = json.random1
    let random2 = json.random2

    expect(json.value).toEqual('at runtime')
    expect(typeof random1).toBe('string')
    expect(typeof random2).toBe('string')

    str = await next.render('/routes/fetch-mixed', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(random1).toEqual(json.random1)
    expect(random2).not.toEqual(json.random2)

    str = await next.render('/routes/-edge/fetch-mixed', {})
    json = JSON.parse(str)

    random1 = json.random1
    random2 = json.random2

    expect(json.value).toEqual('at runtime')
    expect(typeof random1).toBe('string')
    expect(typeof random2).toBe('string')

    str = await next.render('/routes/-edge/fetch-mixed', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(random1).toEqual(json.random1)
    expect(random2).not.toEqual(json.random2)
  })

  it('should prerender GET route handlers that have entirely cached io (unstable_cache)', async () => {
    let str = await next.render('/routes/io-cached', {})
    let json = JSON.parse(str)

    let message1 = json.message1
    let message2 = json.message2

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(typeof message1).toBe('string')
      expect(typeof message2).toBe('string')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(typeof message1).toBe('string')
      expect(typeof message2).toBe('string')
    }

    str = await next.render('/routes/io-cached', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(message1).toEqual(json.message1)
      expect(message2).toEqual(json.message2)
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(message1).toEqual(json.message1)
      expect(message2).toEqual(json.message2)
    }

    str = await next.render('/routes/-edge/io-cached', {})
    json = JSON.parse(str)

    message1 = json.message1
    message2 = json.message2

    expect(json.value).toEqual('at runtime')
    expect(typeof message1).toBe('string')
    expect(typeof message2).toBe('string')

    str = await next.render('/routes/-edge/io-cached', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(message1).toEqual(json.message1)
    expect(message2).toEqual(json.message2)
  })

  it('should prerender GET route handlers that have entirely cached io ("use cache")', async () => {
    let str = await next.render('/routes/use_cache-cached', {})
    let json = JSON.parse(str)

    let message1 = json.message1
    let message2 = json.message2

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(typeof message1).toBe('string')
      expect(typeof message2).toBe('string')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(typeof message1).toBe('string')
      expect(typeof message2).toBe('string')
    }

    str = await next.render('/routes/use_cache-cached', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(message1).toEqual(json.message1)
      expect(message2).toEqual(json.message2)
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(message1).toEqual(json.message1)
      expect(message2).toEqual(json.message2)
    }

    str = await next.render('/routes/-edge/use_cache-cached', {})
    json = JSON.parse(str)

    message1 = json.message1
    message2 = json.message2

    expect(json.value).toEqual('at runtime')
    expect(typeof message1).toBe('string')
    expect(typeof message2).toBe('string')

    str = await next.render('/routes/-edge/use_cache-cached', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(message1).toEqual(json.message1)
    expect(message2).toEqual(json.message2)
  })

  it('should not prerender GET route handlers that have some uncached io (unstable_cache)', async () => {
    let str = await next.render('/routes/io-mixed', {})
    let json = JSON.parse(str)

    let message1 = json.message1
    let message2 = json.message2

    expect(json.value).toEqual('at runtime')
    expect(typeof message1).toBe('string')
    expect(typeof message2).toBe('string')

    str = await next.render('/routes/io-mixed', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(message1).toEqual(json.message1)
    expect(message2).not.toEqual(json.message2)

    str = await next.render('/routes/-edge/io-mixed', {})
    json = JSON.parse(str)

    message1 = json.message1
    message2 = json.message2

    expect(json.value).toEqual('at runtime')
    expect(typeof message1).toBe('string')
    expect(typeof message2).toBe('string')

    str = await next.render('/routes/-edge/io-mixed', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(message1).toEqual(json.message1)
    expect(message2).not.toEqual(json.message2)
  })

  it('should prerender GET route handlers that complete synchronously or in a microtask', async () => {
    let str = await next.render('/routes/microtask', {})
    let json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.message).toBe('microtask')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.message).toBe('microtask')
    }

    str = await next.render('/routes/static-stream-sync', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.message).toBe('stream response')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.message).toBe('stream response')
    }

    str = await next.render('/routes/static-stream-async', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.message).toBe('stream response')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.message).toBe('stream response')
    }

    str = await next.render('/routes/static-string-sync', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.message).toBe('string response')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.message).toBe('string response')
    }

    str = await next.render('/routes/static-string-async', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.message).toBe('string response')
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.message).toBe('string response')
    }

    // Edge versions are always dynamic

    str = await next.render('/routes/-edge/microtask', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('microtask')

    str = await next.render('/routes/-edge/static-stream-sync', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('stream response')

    str = await next.render('/routes/-edge/static-stream-async', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('stream response')

    str = await next.render('/routes/-edge/static-string-sync', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('string response')

    str = await next.render('/routes/-edge/static-string-async', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('string response')
  })

  it('should not prerender GET route handlers that complete in a new Task', async () => {
    let str = await next.render('/routes/task', {})
    let json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('task')

    str = await next.render('/routes/-edge/task', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.message).toBe('task')
  })

  it('should prerender GET route handlers when accessing awaited params', async () => {
    expect(getLines('In route /routes/[dyn]')).toEqual([])
    let str = await next.render('/routes/1/async', {})
    let json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('1')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('1')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    }

    str = await next.render('/routes/2/async', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('2')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    } else {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('2')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    }

    // Edge versions are always dynamic
    str = await next.render('/routes/-edge/1/async', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toBe('dynamic params')
    expect(json.param).toBe('1')
    expect(getLines('In route /routes/-edge/[dyn]')).toEqual([])

    str = await next.render('/routes/-edge/2/async', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toBe('dynamic params')
    expect(json.param).toBe('2')
    expect(getLines('In route /routes/-edge/[dyn]')).toEqual([])
  })

  it('should prerender GET route handlers when accessing params without awaiting first', async () => {
    expect(getLines('In route /routes/[dyn]')).toEqual([])
    let str = await next.render('/routes/1/sync', {})
    let json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('1')
      expect(getLines('In route /routes/[dyn]')).toEqual([
        expect.stringContaining(
          'a param property was accessed directly with `params.dyn`.'
        ),
      ])
    } else {
      expect(json.value).toEqual('at buildtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('1')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    }

    str = await next.render('/routes/2/sync', {})
    json = JSON.parse(str)

    if (isNextDev) {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('2')
      expect(getLines('In route /routes/[dyn]')).toEqual([
        expect.stringContaining(
          'a param property was accessed directly with `params.dyn`.'
        ),
      ])
    } else {
      expect(json.value).toEqual('at runtime')
      expect(json.type).toBe('dynamic params')
      expect(json.param).toBe('2')
      expect(getLines('In route /routes/[dyn]')).toEqual([])
    }

    // Edge versions are always dynamic
    str = await next.render('/routes/-edge/1/sync', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toBe('dynamic params')
    expect(json.param).toBe('1')
    if (isNextDev) {
      expect(getLines('In route /routes/-edge/[dyn]')).toEqual([
        expect.stringContaining(
          'a param property was accessed directly with `params.dyn`.'
        ),
      ])
    } else {
      expect(getLines('In route /routes/-edge/[dyn]')).toEqual([])
    }

    str = await next.render('/routes/-edge/2/sync', {})
    json = JSON.parse(str)

    expect(json.value).toEqual('at runtime')
    expect(json.type).toBe('dynamic params')
    expect(json.param).toBe('2')
    if (isNextDev) {
      expect(getLines('In route /routes/-edge/[dyn]')).toEqual([
        expect.stringContaining(
          'a param property was accessed directly with `params.dyn`.'
        ),
      ])
    } else {
      expect(getLines('In route /routes/-edge/[dyn]')).toEqual([])
    }
  })
})
