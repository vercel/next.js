/* global describe, test, expect */

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
  })
}
