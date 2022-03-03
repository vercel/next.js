import { renderViaHTTP } from 'next-test-utils'

export default async function runtime(context, { runtime }) {
  if (runtime === 'edge') {
    it('should support per-page runtime configuration', async () => {
      const html1 = await renderViaHTTP(context.appPort, '/runtime')
      expect(html1).toContain('Runtime: Node.js')
      const html2 = await renderViaHTTP(context.appPort, '/runtime-rsc')
      expect(html2).toContain('Runtime: Node.js')
    })
  }
}
