import { beforeAll, expect, it, vi } from 'vitest'

let release
const gate = new Promise((resolve) => {
  release = resolve
})
const pending = []
const caught = []
const subject = { value: () => 'original' }

function defer(label, operation) {
  pending.push(
    gate.then(() => {
      try {
        operation()
      } catch (error) {
        caught.push({ label, message: error.message })
      }
    })
  )
}

beforeAll(() => {
  const spy = vi.spyOn(subject, 'value').mockReturnValue('setup')
  const mutate = spy.mockReturnValue
  const spyOn = vi.spyOn
  const clear = vi.clearAllMocks
  defer('hook assertion', () => expect(1).toBe(1))
  defer('hook cached spy API', () => spyOn(subject, 'value'))
  defer('hook cached clear API', () => clear())
  defer('hook cached mock mutator', () => mutate.call(spy, 'late'))
})

it('sealed origin', () => {
  const assertion = expect(1)
  const matcher = assertion.toBe
  defer('attempt assertion', () => expect(1).toBe(1))
  defer('attempt retained assertion', () => assertion.toBe(1))
  defer('attempt cached matcher', () => matcher.call(assertion, 1))
})

it('later case is not contaminated', async () => {
  expect.assertions(3)
  const local = vi.fn()
  local()
  release()
  await Promise.all(pending)
  expect(caught).toHaveLength(7)
  expect(subject.value()).toBe('setup')
  expect(local).toHaveBeenCalledTimes(1)
  for (const failure of caught) {
    const origin = failure.label.startsWith('hook')
      ? 'closed hook scope'
      : 'closed attempt scope "sealed origin"'
    if (!failure.message.includes(origin))
      throw new Error(`Wrong late origin: ${failure.label}: ${failure.message}`)
  }
})
