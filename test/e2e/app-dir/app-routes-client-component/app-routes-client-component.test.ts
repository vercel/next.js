import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('referencing a client component in an app route', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname)),
    dependencies: {
      react: '19.0.0-rc-915b914b3a-20240515',
      'react-dom': '19.0.0-rc-915b914b3a-20240515',
    },
  })

  it('responds without error', async () => {
    expect(JSON.parse(await next.render('/runtime'))).toEqual({
      // Turbopack's proxy components are functions
      clientComponent: process.env.TURBOPACK ? 'function' : 'object',
      myModuleClientComponent: process.env.TURBOPACK ? 'function' : 'object',
    })
  })
})
