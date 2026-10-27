import { value as firstValue } from './emitter.js?first'
import { value as secondValue } from './emitter.js?second'

const getList = __turbopack_collect__({ namespace: 'self-test' })

it('should emit the originating module and preserve its query', async () => {
  expect(firstValue).toBe('self-emitted value')
  expect(secondValue).toBe('self-emitted value')

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
      return module
    })
  )
  expect(modules[0]).not.toBe(modules[1])
})
