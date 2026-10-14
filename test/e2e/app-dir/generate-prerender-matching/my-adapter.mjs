import fs from 'node:fs/promises'

/** @type {import('next').NextAdapter} */
export default {
  name: 'generate-prerender-matching',
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
  },
}
