it('should generate a correct facade from async modules', async () => {
  expect(await import('tla/local')).toEqual(
    expect.objectContaining({
      tla: 'tla',
      reexported: 'reexported',
      reexported2: 'reexported',
    })
  )
  expect(await import('tla/reexport')).toEqual(
    expect.objectContaining({
      local: 'local',
      tlaReexported: 'tla-reexported',
      tlaReexported2: 'tla-reexported',
    })
  )
  expect(await import('tla/both')).toEqual(
    expect.objectContaining({
      tla: 'tla',
      tlaReexported: 'tla-reexported',
      tlaReexported2: 'tla-reexported',
    })
  )
})

import * as tlaLocal from 'tla/local'
import * as tlaReexport from 'tla/reexport'
import * as tlaBoth from 'tla/both'
it('should generate a correct namespace object from async modules', async () => {
  expect(tlaLocal).toEqual(
    expect.objectContaining({
      tla: 'tla',
      reexported: 'reexported',
      reexported2: 'reexported',
    })
  )
  expect(tlaReexport).toEqual(
    expect.objectContaining({
      local: 'local',
      tlaReexported: 'tla-reexported',
      tlaReexported2: 'tla-reexported',
    })
  )
  expect(tlaBoth).toEqual(
    expect.objectContaining({
      tla: 'tla',
      tlaReexported: 'tla-reexported',
      tlaReexported2: 'tla-reexported',
    })
  )
})

import { tlaReexported2 as tlaReexported } from 'tla/reexport'
import { tlaReexported2 as tlaReexportedBoth } from 'tla/both'
it('should generate correct renaming facades from async modules', async () => {
  expect(tlaReexported).toBe('tla-reexported')
  expect(tlaReexportedBoth).toBe('tla-reexported')
})
