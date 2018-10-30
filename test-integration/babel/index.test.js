/* eslint-env jest */
import { runNextDev } from 'next-test-utils'

jest.setTimeout(1000 * 60)

let server

describe('Babel', () => {
  beforeAll(async () => {
    server = await runNextDev(__dirname)
  })
  afterAll(() => server.close())

  describe('Rendering via HTTP', () => {
    it('Should compile a page with flowtype correctly', async () => {
      const $ = await server.fetch$('/')
      expect($('#text').text()).toBe('Test Babel')
    })
  })
})
