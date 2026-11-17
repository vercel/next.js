import fs from 'fs/promises'

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'test-adapter',
  async onBuildComplete(ctx) {
    await fs.writeFile(
      new URL('build-complete.json', import.meta.url),
      JSON.stringify(ctx)
    )
  },
}

export default adapter
