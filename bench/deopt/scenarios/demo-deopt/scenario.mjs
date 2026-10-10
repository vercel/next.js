import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Self-test scenario: a static page with a planted shape hazard. A healthy
 * pipeline reports an eager "wrong map" deopt and a megamorphic IC in
 * `plantedShapeHazard`. No server, no Next.js involved.
 */
export default {
  type: 'browser',
  filter: ['demo-deopt'],
  async drive({ page, scenarioDir }) {
    await page.goto(pathToFileURL(path.join(scenarioDir, 'page.html')).href)
    await page.waitForFunction(() => document.title === 'DEOPT_DONE')
  },
}
