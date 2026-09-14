import { consumeErrorFatality, markErrorAsFatal } from './stitched-error'

describe('error fatality', () => {
  it('is scoped to a single reported occurrence', () => {
    const error = new Error('test')

    markErrorAsFatal(error)

    expect(consumeErrorFatality(error)).toBe(true)
    expect(consumeErrorFatality(error)).toBe(false)
  })
})
