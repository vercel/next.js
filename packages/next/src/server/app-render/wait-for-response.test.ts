import { MockedResponse } from '../lib/mock-request'
import { waitForResponseToFinish } from './wait-for-response'

describe('waitForResponseToFinish', () => {
  it('waits for the response to finish', async () => {
    const response = new MockedResponse()
    const onSettled = jest.fn()
    const completion = waitForResponseToFinish(response)

    void completion.then(onSettled)
    await Promise.resolve()
    expect(onSettled).not.toHaveBeenCalled()

    response.end()

    await expect(completion).resolves.toBe(true)
  })

  it('resolves immediately when the response has already finished', async () => {
    const response = new MockedResponse()
    const finished = new Promise<void>((resolve) => {
      response.once('finish', resolve)
    })

    response.end()
    await finished

    await expect(waitForResponseToFinish(response)).resolves.toBe(true)
  })

  it('returns false when the connection closes before the response finishes', async () => {
    const response = new MockedResponse()
    const completion = waitForResponseToFinish(response)

    response.destroy()

    await expect(completion).resolves.toBe(false)
  })
})
