import fs from 'fs/promises'

// @ts-check
/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'i18n-api-test-adapter',
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
  },
}

export default adapter
