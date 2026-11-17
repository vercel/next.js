import fs from 'fs/promises'

/** @type {import('next').NextAdapter } */
export default {
  name: 'per-route-prerender-manifest',
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
  },
}
