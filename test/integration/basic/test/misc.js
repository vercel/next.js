/* global describe, test, expect */
import fetch from 'node-fetch'

export default function (context) {
  describe('Misc', () => {
    test('finishes response', async () => {
      const res = {
        finished: false,
        end () {
          this.finished = true
        }
      }
      const html = await context.app.renderToHTML({}, res, '/finish-response', {})
      expect(html).toBeFalsy()
    })

    test('allow etag header support', async () => {
      const url = `http://localhost:${context.appPort}/stateless`
      const etag = (await fetch(url)).headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetch(url, { headers })
      expect(res2.status).toBe(304)
    })
  })
}
