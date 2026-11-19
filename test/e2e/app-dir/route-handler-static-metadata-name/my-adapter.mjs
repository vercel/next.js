import fs from 'fs'

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'route-handler-static-metadata-name',
  onBuildComplete: async (ctx) => {
    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx, null, 2)
    )
  },
}

export default adapter
