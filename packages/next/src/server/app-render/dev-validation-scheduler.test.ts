import {
  beginDevValidationRequest,
  yieldToForegroundRequest,
} from './dev-validation-scheduler'

describe('dev validation scheduler', () => {
  it('supersedes validation from an older request on the same server', () => {
    const devServerOwner = {}
    const first = beginDevValidationRequest(devServerOwner)!

    expect(first.aborted).toBe(false)

    const second = beginDevValidationRequest(devServerOwner)!

    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
  })

  it('does not supersede validation owned by another server', () => {
    const first = beginDevValidationRequest({})!
    beginDevValidationRequest({})

    expect(first.aborted).toBe(false)
  })

  it('observes supersession while yielding to incoming requests', async () => {
    const devServerOwner = {}
    const first = beginDevValidationRequest(devServerOwner)!
    const canContinue = yieldToForegroundRequest(first)

    beginDevValidationRequest(devServerOwner)

    await expect(canContinue).resolves.toBe(false)
  })
})
