import * as firstModule from './emitter.js?first'
import * as secondModule from './emitter.js?second'

const getList = __turbopack_collect__({ namespace: 'self-test' })

it('should emit the originating module and preserve its query', async () => {
  for (const module of [firstModule, secondModule]) {
    expect(module).toMatchObject({
      value: 'self-emitted value',
      reexported: 're-exported value',
    })
  }
  expect(firstModule.identity).not.toBe(secondModule.identity)

  const list = getList()
  expect(list).toHaveLength(2)
  expect(list.map((entry) => entry.id)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('emitter.js?first'),
      expect.stringContaining('emitter.js?second'),
    ])
  )
  const modules = await Promise.all(
    list.map(async (entry) => {
      expect(entry.data).toBe('self-emitted data')
      const module = await entry.import()
      expect(module.value).toBe('self-emitted value')
      expect(module.reexported).toBe('re-exported value')
      // Module fragments can expose different namespace wrappers, but must share the instance.
      expect(module.identity).toBe(
        entry.id.includes('?first')
          ? firstModule.identity
          : secondModule.identity
      )
      return module
    })
  )
  expect(modules[0]).not.toBe(modules[1])
})
