import { spawnSync } from 'node:child_process'

describe('compiled jsonwebtoken', () => {
  it('signs and verifies when SlowBuffer is unavailable', () => {
    const jsonwebtokenPath = require.resolve('next/dist/compiled/jsonwebtoken')
    const script = `
      const buffer = require('node:buffer')
      delete buffer.SlowBuffer

      const jsonwebtoken = require(${JSON.stringify(jsonwebtokenPath)})
      const token = jsonwebtoken.sign(
        { preview: true },
        'test-secret',
        { algorithm: 'HS256' }
      )
      const payload = jsonwebtoken.verify(token, 'test-secret', {
        algorithms: ['HS256'],
      })

      if (payload.preview !== true) {
        throw new Error('jsonwebtoken round trip failed')
      }
    `
    const result = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
    })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})
