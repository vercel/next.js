import { createRecordFromThenable } from './create-record-from-thenable'

describe('createRecordFromThenable', () => {
  it('successful promise', async () => {
    const thenable = Promise.resolve('success')
    const record = createRecordFromThenable(thenable)
    expect(record.status).toBe('pending')
    await thenable
    expect(record.status).toBe('fulfilled')
    // typeguard
    if (record.status !== 'fulfilled') {
      throw new Error('Invalid Type')
    }
    expect(record.value).toBe('success')
  })

  it('rejecting promise', async () => {
    const thenable = Promise.reject('error')
    const record = createRecordFromThenable(thenable)
    expect(record.status).toBe('pending')
    await thenable.catch(() => {})
    expect(record.status).toBe('rejected')
    // typeguard
    if (record.status !== 'rejected') {
      throw new Error('Invalid Type')
    }
    expect(record.reason).toBe('error')
  })
})
