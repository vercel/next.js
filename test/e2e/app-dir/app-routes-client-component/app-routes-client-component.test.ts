import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('referencing a client component in an app route', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname)),
  })

  it('responds without error', async () => {
    expect(JSON.parse(await next.render('/runtime'))).toEqual({
      // Turbopack's proxy components are functions
      clientComponent: process.env.TURBOPACK ? 'function' : 'object',
      myModuleClientComponent: process.env.TURBOPACK ? 'function' : 'object',
    })
  })
})
