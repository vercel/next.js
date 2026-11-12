import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

it('retains the actual trigger realm without repeating empty setup and preserves real setup owners', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'retained-context.cjs')],
    { timeout: 45000 }
  )
  expect(JSON.parse(stdout)).toEqual({
    scenarios: 6,
    allActualWorkersJoined: true,
    emptySetupRpcs: 0,
    actualGlobalSetupRpcs: 2,
    freshProvide: true,
    actualMapperCounterHeld: true,
  })
}, 50000)
