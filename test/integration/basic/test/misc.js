/* global describe, test, expect */

export default function ({ app }) {
  describe('Misc', () => {
    test('finishes response', async () => {
      const res = {
        finished: false,
        end () {
          this.finished = true
        }
      }
      const html = await app.renderToHTML({}, res, '/finish-response', {})
      expect(html).toBeFalsy()
    })
  })
}
