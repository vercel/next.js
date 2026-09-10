import fs from 'fs/promises'

/** @type {import('next').NextAdapter} */
export default {
  name: 'variants-build-output',
  async onBuildComplete(context) {
    await fs.writeFile('build-complete.json', JSON.stringify(context, null, 2))
  },
}
