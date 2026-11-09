import './setup.js'
import { atEvaluation, kept } from './library/context.js'
import { outer, innerAtEvaluation } from './library/nested-outer.js'
import { never } from './library/throws.js'

const events = globalThis.deferEvents
const request = globalThis.deferRequest
const evaluatedBefore = [...events]

async function readContext() {
  return { atEvaluation, ...(await kept()) }
}

function readNested() {
  return { outer, inner: innerAtEvaluation.request }
}

function readNever() {
  return never
}

it('evaluates a deferred module outside the async context of its first read', async () => {
  expect(evaluatedBefore).toEqual([])
  const outside = {
    atEvaluation: undefined,
    snapshot: undefined,
    bound: undefined,
    timer: undefined,
    asyncFunction: undefined,
  }

  // The first read happens while a request is handled.
  expect(await request.run('request 1', readContext)).toEqual(outside)
  expect(events).toEqual(['context'])
  // Nothing that the module created at its top level kept that request.
  expect(await request.run('request 2', readContext)).toEqual(outside)
  expect(await readContext()).toEqual(outside)
  expect(events).toEqual(['context'])
})

it('evaluates a deferred import of a deferred module outside the async context of the first read', () => {
  expect(request.run('request 3', readNested)).toEqual({
    outer: undefined,
    inner: undefined,
  })
  expect(events).toEqual(['context', 'nested-outer', 'nested-inner'])
})

it('throws the evaluation error of a deferred module at the read, with the stack of both', () => {
  let error
  try {
    request.run('request 4', readNever)
  } catch (e) {
    error = e
  }
  expect(error.message).toBe('thrown by throws.js in undefined')
  // The function that threw, and the function that read the export.
  expect(error.stack).toMatch(
    /\n\s+at throwAtEvaluation [^]*\n\s+at readNever /
  )
  expect(() => request.run('request 5', readNever)).toThrow(error)
  expect(events.filter((event) => event === 'throws')).toEqual(['throws'])
})
