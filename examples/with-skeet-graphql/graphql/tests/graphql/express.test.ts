import request from 'supertest'
import { expressServer } from '../../src/index'

describe('Skeet App is Running', () => {
  test('GET', (done) => {
    request(expressServer)
      .get('/')
      .then((res) => {
        expect(res.statusCode).toBe(200)
        done()
      })
      .catch((err) => {
        done(err)
      })
  })
})
