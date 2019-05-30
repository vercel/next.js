/* eslint-env jest */
import { renderViaHTTP } from 'next-test-utils'

export default context => {
  describe('Public folder', () => {
    it('should allow access to public files', async () => {
      const data = await renderViaHTTP(context.appPort, '/data/data.txt')
      expect(data).toBe('data')
    })

    it('should prioritize pages over public files', async () => {
      const html = await renderViaHTTP(context.appPort, '/about')
      const data = await renderViaHTTP(context.appPort, '/file')

      expect(html).toMatch(/About Page/)
      expect(data).toBe('test')
    })
  })
}
