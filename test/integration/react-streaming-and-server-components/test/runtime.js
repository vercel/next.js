import { renderViaHTTP } from 'next-test-utils'

export default async function runtime(context, { runtime }) {
  if (runtime === 'edge') {
    it('should support per-page runtime configuration', async () => {
      const html = await renderViaHTTP(context.appPort, '/runtime')
      expect(html).toContain('Runtime: Node.js')
      const html = await renderViaHTTP(context.appPort, '/runtime-rsc')
      expect(html).toContain('Runtime: Node.js')
    })
  }
}
