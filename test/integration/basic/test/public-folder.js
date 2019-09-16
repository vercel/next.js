/* eslint-env jest */
import { renderViaHTTP } from 'next-test-utils'

export default context => {
  describe('Public folder', () => {
    it('should allow access to public files', async () => {
      const data = await renderViaHTTP(context.appPort, '/data/data.txt')
      expect(data).toBe('data')
    })
  })
}
