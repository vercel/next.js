/* global describe, test, expect */

export default function ({ app }, suiteName, render) {
  describe(suiteName, () => {
    test('renders a stateless component', async () => {
      const html = await render('/')
      expect(html.includes('<meta charset="utf-8" class="next-head"/>')).toBeTruthy()
      expect(html.includes('Just a page in /foo')).toBeTruthy()
    })
  })
}
