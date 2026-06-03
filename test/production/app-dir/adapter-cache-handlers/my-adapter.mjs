import fs from 'fs/promises'

/** @type {import('next').NextAdapter } */
export default {
  name: 'adapter-cache-handlers',
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
  },
}
