import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const adapter = {
  name: 'adapter-metadata-revalidate',
  onBuildComplete: async (ctx) => {
    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx.outputs, null, 2)
    )
  },
}

export default adapter
