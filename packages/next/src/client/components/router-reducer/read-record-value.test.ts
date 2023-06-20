import { readRecordValue } from './read-record-value'
import { createRecordFromThenable } from './create-record-from-thenable'
describe('readRecordValue', () => {
  it('successful promise', async () => {
    const thenable = Promise.resolve('success')
    const record = createRecordFromThenable(thenable)
    expect(() => readRecordValue(record)).toThrow()
    await thenable
    expect(readRecordValue(record)).toBe('success')
  })

  it('rejecting promise', async () => {
    const thenable = Promise.reject('failed')
    const record = createRecordFromThenable(thenable)
    expect(() => readRecordValue(record)).toThrow()
    await thenable.catch(() => {})
    expect(() => readRecordValue(record)).toThrow()
    const result: any = (() => {
      try {
        return readRecordValue(record)
      } catch (err) {
        return err
      }
    })()
    expect(result.status).toBe('rejected')
    expect(result.value).toBe('failed')
  })
})
